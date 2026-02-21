# Chiko Judge Server

评测机服务（Judge Server），提供代码编译、运行、评测、交互题评测的 HTTP API。

## 功能概览

- 上传与缓存源代码、二进制、输入/输出数据、Checker
- 编译源代码与自定义 Checker
- 程序评测（SPJ / testlib）
- 程序运行（仅执行，不判题）
- 交互题评测
- 任务队列与状态查询

## 运行环境

- Node.js（ES Modules）
- pnpm

## 快速开始

```bash
pnpm install

# 方式 1：环境变量
export JUDGE_TOKEN=your-token
export JUDGE_PORT=3235
export JUDGE_HOST=0.0.0.0
export JUDGE_THREADS=1
export LOG_LEVEL=info

pnpm start
```

可选：在项目根目录创建 `.env`（服务启动时会自动读取）。

```env
JUDGE_TOKEN=your-token
JUDGE_PORT=3235
JUDGE_HOST=0.0.0.0
JUDGE_THREADS=1
LOG_LEVEL=info
```

启动后：

- 健康检查：`GET /health`
- 默认地址：`http://0.0.0.0:3235`

## 配置项

| 变量名        | 说明         | 必需 | 默认值  |
| ------------- | ------------ | ---- | ------- |
| `JUDGE_TOKEN` | API 访问令牌 | 是   | -       |
| `JUDGE_PORT`  | 服务端口     | 否   | 3235    |
| `JUDGE_HOST`  | 监听地址     | 否   | 0.0.0.0 |
| `JUDGE_THREADS` | 评测并发 worker 数（任务并发执行） | 否 | 1 |
| `LOG_LEVEL`   | 日志级别     | 否   | info    |

## 鉴权方式

除 `GET /health` 外，所有接口都需要 Token 鉴权：

- Header：`X-Auth-Token: <your-token>`
- Query：`?token=<your-token>`

## 缓存系统

所有文件（源代码、二进制、输入/输出数据等）通过缓存系统管理。

- **有效期**：5 分钟
- **类型**：`source`（源代码）、`binary`（二进制）、`input`（输入数据）、`output`（输出数据/答案）、`checker`（检查器）
- **上传限制**：单文件上限 100MB

---

# API 文档

**基础信息**

- **协议**：HTTP
- **数据格式**：JSON
- **默认端口**：3235（可通过 `JUDGE_PORT` 修改）
- **认证**：除健康检查外均需鉴权

> 说明：编译/评测/运行/交互等接口返回任务 ID，需轮询 `GET /task/:taskId` 获取最终结果。

---

## 1. 健康检查

```http
GET /health
```

无需鉴权，返回服务状态。

**响应**

```json
{
  "status": "ok",
  "timestamp": 1708000000000
}
```

---

## 2. 上传文件

```http
POST /upload
Content-Type: multipart/form-data
```

上传文件到缓存系统。

**请求参数（multipart/form-data）**

| 字段   | 类型   | 必需 | 说明                    |
| ------ | ------ | ---- | ----------------------- |
| `file` | file   | 是   | 文件内容                |
| `type` | string | 否   | 缓存类型，默认 `source` |

**响应**

```json
{
  "cacheId": "550e8400-e29b-41d4-a716-446655440000",
  "fileName": "main.cpp",
  "type": "source",
  "size": 1024,
  "expiresIn": 300
}
```

**示例**

```bash
curl -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@main.cpp" \
  -F "type=source"
```

---

## 3. 编译程序

```http
POST /compile
Content-Type: application/json
```

提交编译任务，将源代码编译为二进制文件。

**请求体**

```json
{
  "sourceCacheId": "string", // 必需：源代码缓存ID
  "language": "cpp", // 可选：编程语言，默认 cpp
  "priority": 0 // 可选：优先级（数值越大越优先），默认 0
}
```

**响应**

```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

**轮询任务状态**（完成后 `result` 字段包含）

```json
{
  "taskId": "task-uuid",
  "type": "compile",
  "status": "completed",
  "result": {
    "success": true,
    "binaryCacheId": "binary-cache-uuid",
    "compileInfo": "编译输出信息"
  }
}
```

编译失败时：

```json
{
  "result": {
    "success": false,
    "compileInfo": "main.cpp:5:5: error: ..."
  }
}
```

---

## 4. 编译自定义 Checker

```http
POST /compile/checker
Content-Type: application/json
```

编译自定义 SPJ checker。编译时会自动引入 `testlib.h`。

**请求体**

```json
{
  "sourceCacheId": "string", // 必需：checker 源代码缓存ID
  "language": "cpp", // 可选：编程语言，默认 cpp
  "priority": 0 // 可选：优先级，默认 0
}
```

**响应**

```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "message": "Checker compile task submitted successfully"
}
```

**轮询任务状态**（完成后 `result` 字段包含）

```json
{
  "taskId": "task-uuid",
  "type": "compile-checker",
  "status": "completed",
  "result": {
    "success": true,
    "checkerCacheId": "checker-cache-uuid",
    "compileInfo": "编译输出信息"
  }
}
```

**在评测接口中使用自定义 Checker**

将 `checkerName` 设置为 `checkerCacheId`（UUID 格式）。

```json
{
  "binaryCacheId": "binary-uuid",
  "inputCacheId": "input-uuid",
  "outputCacheId": "output-uuid",
  "checkerName": "checker-cache-uuid"
}
```

**自定义 Checker 编写规范（testlib）**

```cpp
#include "testlib.h"

int main(int argc, char *argv[]) {
    registerTestlibCmd(argc, argv);

    // 读取标准答案：ans.readXXX()
    // 读取用户输出：ouf.readXXX()

    if (正确) {
        quitf(_ok, "Accepted message");
    } else {
        quitf(_wa, "Wrong answer message");
    }
}
```

---

## 5. 评测程序

```http
POST /judge
Content-Type: application/json
```

提交评测任务，运行程序并使用 SPJ 判断结果。

**请求体**

```json
{
  "binaryCacheId": "string", // 必需：二进制文件缓存ID
  "inputCacheId": "string", // 必需：输入数据缓存ID
  "outputCacheId": "string", // 必需：标准答案缓存ID
  "checkerName": "icmp", // 可选：检查器名称，默认 icmp
  "timeLimit": 1000, // 可选：时间限制(ms)，默认 1000
  "memoryLimit": 131072, // 可选：内存限制(KB)，默认 128MB
  "isFileInput": false, // 可选：是否使用文件IO，默认 false
  "inputFileName": "input.txt", // 可选：输入文件名（文件IO时）
  "outputFileName": "output.txt", // 可选：输出文件名（文件IO时）
  "priority": 0 // 可选：优先级，默认 0
}
```

**可用检查器**（基于 testlib）

- `icmp`: 忽略空格的文本比较
- `ncmp`: 数值比较
- `wcmp`: 逐词比较
- `rcmp`, `rcmp4`, `rcmp6`, `rcmp9`: 浮点数比较
- `yesno`: Yes/No 答案比较
- 其他 testlib 检查器

**响应**

```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

**轮询任务状态**（完成后）

```json
{
  "taskId": "task-uuid",
  "type": "judge",
  "status": "completed",
  "result": {
    "status": "accepted", // accepted | wrong-answer | partial-accepted | time-limit-exceeded | memory-limit-exceeded | runtime-error
    "score": 100, // 原始分数 0-100
    "normalizedScore": 1, // 归一化分数 0-1
    "time": 5, // 运行时间(ms)
    "memory": 45056, // 内存使用(KB)
    "output": "3\n", // 程序输出
    "checkerMessage": "1 number(s): \"3\""
  }
}
```

---

## 6. 运行程序

```http
POST /run
Content-Type: application/json
```

提交运行任务，只运行程序并返回输出，不进行答案检查。

**请求体**

```json
{
  "binaryCacheId": "string", // 必需：二进制文件缓存ID
  "inputCacheId": "string", // 必需：输入数据缓存ID
  "timeLimit": 1000, // 可选：时间限制(ms)，默认 1000
  "memoryLimit": 131072, // 可选：内存限制(KB)，默认 128MB
  "isFileInput": false, // 可选：是否使用文件IO，默认 false
  "inputFileName": "input.txt", // 可选：输入文件名（文件IO时）
  "outputFileName": "output.txt", // 可选：输出文件名（文件IO时）
  "priority": 0 // 可选：优先级，默认 0
}
```

**响应**

```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

**轮询任务状态**（完成后）

```json
{
  "taskId": "task-uuid",
  "type": "run",
  "status": "completed",
  "result": {
    "status": "exited-normally", // exited-normally | non-zero-exit | time-limit-exceeded | memory-limit-exceeded | runtime-error
    "exitCode": 0,
    "time": 5,
    "memory": 45056,
    "output": "Hello World\n",
    "error": ""
  }
}
```

---

## 7. 交互题评测

```http
POST /interactive
Content-Type: application/json
```

提交交互题评测任务，用户程序与交互器进行交互。

**请求体**

```json
{
  "userBinaryCacheId": "string", // 必需：用户程序二进制缓存ID
  "interactorBinaryCacheId": "string", // 必需：交互器二进制缓存ID
  "timeLimit": 1000, // 可选：用户程序时间限制(ms)
  "memoryLimit": 131072, // 可选：用户程序内存限制(KB)
  "interactorTimeLimit": 5000, // 可选：交互器时间限制(ms)
  "interactorMemoryLimit": 131072, // 可选：交互器内存限制(KB)
  "inputCacheId": "string", // 可选：交互器输入文件缓存ID
  "scoreFileName": "score.txt", // 可选：分数文件名
  "messageFileName": "message.txt", // 可选：消息文件名
  "priority": 0 // 可选：优先级
}
```

**交互器要求**

- 交互器需要将分数（0-100）写入 `score.txt`
- 交互器需要将提示信息写入 `message.txt`
- 交互器与用户程序通过标准输入输出进行交互

**响应**

```json
{
  "taskId": "task-uuid",
  "status": "pending",
  "message": "Task submitted successfully"
}
```

**轮询任务状态**（完成后）

```json
{
  "taskId": "task-uuid",
  "type": "interactive",
  "status": "completed",
  "result": {
    "verdict": "accepted", // accepted | partial | wrong-answer | user-error | interactor-error | invalid-interaction
    "score": 100,
    "normalizedScore": 1,
    "message": "Correct!",
    "reason": null,
    "userTime": 5,
    "userMemory": 45056,
    "interactorTime": 2,
    "interactorMemory": 32768,
    "userError": "",
    "interactorError": ""
  }
}
```

---

## 8. 查询任务状态

```http
GET /task/:taskId
```

轮询查询任务状态。

**响应**

```json
{
  "id": "task-uuid",
  "type": "compile",
  "status": "pending", // pending | running | completed | failed
  "priority": 0,
  "result": null,
  "error": null,
  "createdAt": 1708000000000,
  "startedAt": null,
  "completedAt": null
}
```

---

## 9. 下载缓存文件

```http
GET /cache/:cacheId
```

下载缓存中的文件（二进制流）。

---

## 10. 服务器状态

```http
GET /status
```

获取服务器状态信息。

**响应**

```json
{
  "queue": {
    "queueSize": 5,
    "isProcessing": true,
    "currentTask": "task-uuid",
    "runningTasks": ["task-uuid-a", "task-uuid-b"],
    "activeWorkers": 2,
    "concurrency": 4,
    "totalTasks": 100
  },
  "cache": {
    "count": 20,
    "totalSize": 1048576,
    "totalSizeMB": "1.00"
  },
  "uptime": 3600
}
```

---

# 错误处理

统一错误响应格式：

```json
{
  "error": "错误描述",
  "statusCode": 400
}
```

常见错误码：

| 状态码 | 说明                       |
| ------ | -------------------------- |
| 400    | 请求参数错误               |
| 401    | 未授权（Token 无效或缺失） |
| 404    | 资源不存在（任务或缓存）   |
| 500    | 服务器内部错误             |

---

# 任务状态流转

```
pending -> running -> completed
                  \-> failed
```

---

# 优先级说明

- 优先级为数值，**越大越优先**
- 相同优先级时，按提交时间先后处理（FIFO）
- 建议：高优先级任务使用更大的数值（如 10、100）

---

# 完整工作流程示例

## 示例 1：编译并评测 A+B

```bash
# 1. 上传源代码
SOURCE_ID=$(curl -s -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@solution.cpp" \
  -F "type=source" | jq -r '.cacheId')

# 2. 上传输入数据
INPUT_ID=$(curl -s -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@input.txt" \
  -F "type=input" | jq -r '.cacheId')

# 3. 上传答案
OUTPUT_ID=$(curl -s -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@answer.txt" \
  -F "type=output" | jq -r '.cacheId')

# 4. 提交编译任务
COMPILE_TASK=$(curl -s -X POST http://localhost:3235/compile \
  -H "X-Auth-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{\"sourceCacheId\":\"$SOURCE_ID\"}" | jq -r '.taskId')

# 5. 轮询编译状态
until [ "$(curl -s http://localhost:3235/task/$COMPILE_TASK \
  -H "X-Auth-Token: your-token" | jq -r '.status')" = "completed" ]; do
  sleep 0.5
done

# 6. 获取二进制缓存ID
BINARY_ID=$(curl -s http://localhost:3235/task/$COMPILE_TASK \
  -H "X-Auth-Token: your-token" | jq -r '.result.binaryCacheId')

# 7. 提交评测任务
JUDGE_TASK=$(curl -s -X POST http://localhost:3235/judge \
  -H "X-Auth-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{\"binaryCacheId\":\"$BINARY_ID\",\"inputCacheId\":\"$INPUT_ID\",\"outputCacheId\":\"$OUTPUT_ID\",\"checkerName\":\"ncmp\"}" \
  | jq -r '.taskId')

# 8. 轮询评测状态
until [ "$(curl -s http://localhost:3235/task/$JUDGE_TASK \
  -H "X-Auth-Token: your-token" | jq -r '.status')" = "completed" ]; do
  sleep 0.5
done

# 9. 获取评测结果
curl -s http://localhost:3235/task/$JUDGE_TASK \
  -H "X-Auth-Token: your-token" | jq '.result'
```

## 示例 2：交互题评测

```bash
# 1. 上传用户程序二进制
USER_BIN_ID=$(curl -s -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@user_program" \
  -F "type=binary" | jq -r '.cacheId')

# 2. 上传交互器二进制
INTERACTOR_BIN_ID=$(curl -s -X POST http://localhost:3235/upload \
  -H "X-Auth-Token: your-token" \
  -F "file=@interactor" \
  -F "type=binary" | jq -r '.cacheId')

# 3. 提交交互评测任务
TASK_ID=$(curl -s -X POST http://localhost:3235/interactive \
  -H "X-Auth-Token: your-token" \
  -H "Content-Type: application/json" \
  -d "{\"userBinaryCacheId\":\"$USER_BIN_ID\",\"interactorBinaryCacheId\":\"$INTERACTOR_BIN_ID\"}" \
  | jq -r '.taskId')

# 4. 轮询并获取结果
curl -s http://localhost:3235/task/$TASK_ID \
  -H "X-Auth-Token: your-token" | jq '.result'
```
