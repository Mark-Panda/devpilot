# RuleGo DSL 完整示例

## 示例 1：LLM 问答链（最简）

**场景**：用户输入问题 → LLM 处理 → 返回答案

```json
{
  "ruleChain": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "name": "LLM 问答链",
    "debugMode": false,
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      {
        "id": "start1",
        "type": "startTrigger",
        "name": "开始",
        "debugMode": false,
        "configuration": {}
      },
      {
        "id": "llm1",
        "type": "ai/llm",
        "name": "LLM 处理",
        "debugMode": false,
        "configuration": {
          "url": "https://ai.gitee.com/v1",
          "key": "",
          "model": "Qwen2.5-72B-Instruct",
          "systemPrompt": "你是一个专业的 AI 助手，请用中文简洁地回答问题。",
          "messages": [],
          "params": {
            "temperature": 0.7,
            "topP": 0.9,
            "presencePenalty": 0,
            "frequencyPenalty": 0,
            "maxTokens": 2000,
            "stop": [],
            "responseFormat": "text"
          },
          "enabled_skill_names": [],
          "mcp": { "server_command": [], "server_url": "", "env": {}, "tool_names": [] }
        }
      }
    ],
    "connections": [
      { "fromId": "start1", "toId": "llm1", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

**执行方式**：
```javascript
await window.go.rulego.Service.ExecuteRule("a1b2c3d4-e5f6-7890-abcd-ef1234567890", {
  message_type: "default",
  metadata: {},
  data: JSON.stringify("请解释什么是规则引擎？")
});
```

---

## 示例 2：LLM → HTTP 回调链

**场景**：LLM 处理后将结果 POST 到回调接口

```json
{
  "ruleChain": {
    "id": "b2c3d4e5-f6a7-8901-bcde-f12345678901",
    "name": "LLM 回调链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "ai/llm",
        "name": "LLM 分析",
        "debugMode": false,
        "configuration": {
          "url": "https://ai.gitee.com/v1",
          "key": "",
          "model": "Qwen2.5-72B-Instruct",
          "systemPrompt": "分析输入数据并返回 JSON 格式的结论",
          "messages": [],
          "params": { "temperature": 0.5, "topP": 0.8, "responseFormat": "json_object", "maxTokens": 1000, "stop": [], "presencePenalty": 0, "frequencyPenalty": 0 },
          "enabled_skill_names": [],
          "mcp": { "server_command": [], "server_url": "", "env": {}, "tool_names": [] }
        }
      },
      {
        "id": "s3",
        "type": "restApiCall",
        "name": "回调通知",
        "debugMode": false,
        "configuration": {
          "restEndpointUrlPattern": "http://localhost:8080/webhook/result",
          "requestMethod": "POST",
          "headers": { "Content-Type": "application/json", "X-Source": "devpilot" },
          "query": {},
          "body": "",
          "timeout": 10000,
          "maxParallelRequestsCount": 100
        }
      },
      {
        "id": "s4",
        "type": "log",
        "name": "记录错误",
        "debugMode": false,
        "configuration": { "jsScript": "return 'LLM Error: ' + JSON.stringify(msg);" }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "Success" },
      { "fromId": "s2", "toId": "s4", "type": "Failure" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 3：条件过滤链（温度报警）

**场景**：传感器数据 → 过滤高温 → 不同处理

```json
{
  "ruleChain": {
    "id": "c3d4e5f6-a7b8-9012-cdef-123456789012",
    "name": "温度报警链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "jsFilter",
        "name": "高温过滤",
        "debugMode": false,
        "configuration": {
          "jsScript": "return msg.temperature > 80;"
        }
      },
      {
        "id": "s3",
        "type": "jsTransform",
        "name": "构造报警消息",
        "debugMode": false,
        "configuration": {
          "jsScript": "msg.alert = true;\nmsg.message = '温度过高: ' + msg.temperature + '°C';\nreturn { msg: msg, metadata: metadata, msgType: 'ALERT' };"
        }
      },
      {
        "id": "s4",
        "type": "restApiCall",
        "name": "发送报警",
        "debugMode": false,
        "configuration": {
          "restEndpointUrlPattern": "http://alert.example.com/notify",
          "requestMethod": "POST",
          "headers": { "Content-Type": "application/json" },
          "query": {},
          "body": "",
          "timeout": 5000,
          "maxParallelRequestsCount": 50
        }
      },
      {
        "id": "s5",
        "type": "log",
        "name": "记录正常",
        "debugMode": false,
        "configuration": { "jsScript": "return '温度正常: ' + msg.temperature;" }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "True" },
      { "fromId": "s2", "toId": "s5", "type": "False" },
      { "fromId": "s3", "toId": "s4", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 4：多级条件分支（switch）

**场景**：用户积分 → 分级处理

```json
{
  "ruleChain": {
    "id": "d4e5f6a7-b8c9-0123-def0-234567890123",
    "name": "积分等级链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "switch",
        "name": "积分分级",
        "debugMode": false,
        "configuration": {
          "cases": [
            { "case": "msg.score >= 90", "then": "Case1" },
            { "case": "msg.score >= 70", "then": "Case2" },
            { "case": "msg.score >= 60", "then": "Case3" }
          ]
        }
      },
      {
        "id": "s3", "type": "jsTransform", "name": "黄金会员",
        "debugMode": false,
        "configuration": { "jsScript": "msg.level='gold';\nreturn {msg,metadata,msgType};" }
      },
      {
        "id": "s4", "type": "jsTransform", "name": "白银会员",
        "debugMode": false,
        "configuration": { "jsScript": "msg.level='silver';\nreturn {msg,metadata,msgType};" }
      },
      {
        "id": "s5", "type": "jsTransform", "name": "普通会员",
        "debugMode": false,
        "configuration": { "jsScript": "msg.level='normal';\nreturn {msg,metadata,msgType};" }
      },
      {
        "id": "s6", "type": "jsTransform", "name": "游客",
        "debugMode": false,
        "configuration": { "jsScript": "msg.level='guest';\nreturn {msg,metadata,msgType};" }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "Case1" },
      { "fromId": "s2", "toId": "s4", "type": "Case2" },
      { "fromId": "s2", "toId": "s5", "type": "Case3" },
      { "fromId": "s2", "toId": "s6", "type": "Default" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 5：循环处理链（for）

**场景**：批量处理数组中的每个元素

```json
{
  "ruleChain": {
    "id": "e5f6a7b8-c9d0-1234-ef01-345678901234",
    "name": "批量处理链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "for",
        "name": "遍历列表",
        "debugMode": false,
        "configuration": {
          "range": "${msg.items}",
          "do": "s3",
          "mode": 1
        }
      },
      {
        "id": "s3",
        "type": "jsTransform",
        "name": "处理单项",
        "debugMode": false,
        "configuration": {
          "jsScript": "msg.processed = true;\nmsg.value = msg.value * 2;\nreturn {msg, metadata, msgType};"
        }
      },
      {
        "id": "s4",
        "type": "log",
        "name": "输出结果",
        "debugMode": false,
        "configuration": { "jsScript": "return '处理完成，结果: ' + JSON.stringify(msg);" }
      }
    ],
    "connections": [
      { "fromId": "s1",  "toId": "s2", "type": "Success" },
      { "fromId": "s2",  "toId": "s3", "type": "Do" },
      { "fromId": "s2",  "toId": "s4", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 6：并行处理链（fork + join）

**场景**：同一消息同时发送给多个处理器，等待全部完成后汇聚

```json
{
  "ruleChain": {
    "id": "f6a7b8c9-d0e1-2345-f012-456789012345",
    "name": "并行处理链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      { "id": "s2", "type": "fork", "name": "分发", "debugMode": false, "configuration": {} },
      {
        "id": "s3", "type": "restApiCall", "name": "服务A",
        "debugMode": false,
        "configuration": {
          "restEndpointUrlPattern": "http://service-a.example.com/process",
          "requestMethod": "POST",
          "headers": {},
          "query": {},
          "body": "",
          "timeout": 10000,
          "maxParallelRequestsCount": 10
        }
      },
      {
        "id": "s4", "type": "restApiCall", "name": "服务B",
        "debugMode": false,
        "configuration": {
          "restEndpointUrlPattern": "http://service-b.example.com/process",
          "requestMethod": "POST",
          "headers": {},
          "query": {},
          "body": "",
          "timeout": 10000,
          "maxParallelRequestsCount": 10
        }
      },
      {
        "id": "s5",
        "type": "join",
        "name": "汇聚",
        "debugMode": false,
        "configuration": { "timeout": 30000, "mergeToMap": true }
      },
      {
        "id": "s6", "type": "log", "name": "输出",
        "debugMode": false,
        "configuration": { "jsScript": "return '并行结果: ' + JSON.stringify(msg);" }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "Success" },
      { "fromId": "s2", "toId": "s4", "type": "Success" },
      { "fromId": "s3", "toId": "s5", "type": "Success" },
      { "fromId": "s4", "toId": "s5", "type": "Success" },
      { "fromId": "s5", "toId": "s6", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 7：数据库查询 + LLM 分析链

**场景**：查询数据库 → 将结果传给 LLM 分析 → 返回见解

```json
{
  "ruleChain": {
    "id": "a7b8c9d0-e1f2-3456-0123-567890123456",
    "name": "DB+LLM 分析链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "dbClient",
        "name": "查询数据",
        "debugMode": false,
        "configuration": {
          "driverName": "mysql",
          "dsn": "root:password@tcp(127.0.0.1:3306)/analytics",
          "poolSize": 5,
          "sql": "SELECT * FROM sales WHERE date >= DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 100",
          "params": [],
          "getOne": false,
          "opType": ""
        }
      },
      {
        "id": "s3",
        "type": "jsTransform",
        "name": "构造分析请求",
        "debugMode": false,
        "configuration": {
          "jsScript": "const prompt = '请分析以下销售数据并给出趋势报告：\\n' + JSON.stringify(msg);\nreturn { msg: prompt, metadata: metadata, msgType: msgType };"
        }
      },
      {
        "id": "s4",
        "type": "ai/llm",
        "name": "LLM 分析",
        "debugMode": false,
        "configuration": {
          "url": "https://ai.gitee.com/v1",
          "key": "",
          "model": "Qwen2.5-72B-Instruct",
          "systemPrompt": "你是一个数据分析专家，请根据提供的数据给出专业的分析报告，包括趋势、异常和建议。",
          "messages": [],
          "params": { "temperature": 0.3, "topP": 0.8, "responseFormat": "text", "maxTokens": 3000, "stop": [], "presencePenalty": 0, "frequencyPenalty": 0 },
          "enabled_skill_names": [],
          "mcp": { "server_command": [], "server_url": "", "env": {}, "tool_names": [] }
        }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "Success" },
      { "fromId": "s3", "toId": "s4", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 示例 8：子规则链（flow 调用）

**主链**调用**子链**处理：

**子链定义**（`root: false`）：
```json
{
  "ruleChain": {
    "id": "b8c9d0e1-f2a3-4567-1234-678901234567",
    "name": "数据验证子链",
    "root": false,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "jsFilter",
        "name": "验证字段",
        "debugMode": false,
        "configuration": {
          "jsScript": "return msg.name && msg.name.length > 0 && msg.age > 0 && msg.age < 150;"
        }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" }
    ],
    "ruleChainConnections": []
  }
}
```

**主链**调用子链：
```json
{
  "ruleChain": {
    "id": "c9d0e1f2-a3b4-5678-2345-789012345678",
    "name": "主处理链",
    "root": true,
    "disabled": false
  },
  "metadata": {
    "firstNodeIndex": 0,
    "nodes": [
      { "id": "s1", "type": "startTrigger", "name": "开始", "debugMode": false, "configuration": {} },
      {
        "id": "s2",
        "type": "flow",
        "name": "调用验证子链",
        "debugMode": false,
        "configuration": {
          "targetId": "b8c9d0e1-f2a3-4567-1234-678901234567",
          "extend": false
        }
      },
      {
        "id": "s3", "type": "log", "name": "验证通过",
        "debugMode": false,
        "configuration": { "jsScript": "return '验证通过: ' + JSON.stringify(msg);" }
      },
      {
        "id": "s4", "type": "log", "name": "验证失败",
        "debugMode": false,
        "configuration": { "jsScript": "return '验证失败: ' + JSON.stringify(msg);" }
      }
    ],
    "connections": [
      { "fromId": "s1", "toId": "s2", "type": "Success" },
      { "fromId": "s2", "toId": "s3", "type": "Success" },
      { "fromId": "s2", "toId": "s4", "type": "Failure" }
    ],
    "ruleChainConnections": []
  }
}
```

---

## 完整创建流程代码示例

> **说明**：以下代码运行在**前端 JS 层**（Wails IPC）。大模型在后端 Go 进程中运行，不能直接执行 `window.go.*`——大模型应将生成的 DSL 输出给前端，由前端代码提交创建。

```javascript
// 生成 UUID v4（浏览器原生支持）
function generateUUID() {
  return crypto.randomUUID();
}

// 1. 构建 DSL（由大模型生成，前端拿到后提交）
const dsl = {
  ruleChain: {
    id: generateUUID(),  // UUID v4 格式，如 "550e8400-e29b-41d4-a716-446655440000"
    name: "我的规则链",
    debugMode: false,
    root: true,
    disabled: false
  },
  metadata: {
    firstNodeIndex: 0,
    nodes: [
      { id: "s1", type: "startTrigger", name: "开始", debugMode: false, configuration: {} },
      {
        id: "s2", type: "ai/llm", name: "LLM", debugMode: false,
        configuration: {
          url: "https://ai.gitee.com/v1",
          key: "",
          model: "Qwen2.5-72B-Instruct",
          systemPrompt: "你是助手",
          messages: [],
          params: { temperature: 0.7, topP: 0.9, responseFormat: "text", maxTokens: 0, stop: [], presencePenalty: 0, frequencyPenalty: 0 },
          enabled_skill_names: [],
          mcp: { server_command: [], server_url: "", env: {}, tool_names: [] }
        }
      }
    ],
    connections: [
      { fromId: "s1", toId: "s2", type: "Success" }
    ],
    ruleChainConnections: []
  }
};

// 2. 先用 ExecuteRuleDefinition 测试
const testResult = await window.go.rulego.Service.ExecuteRuleDefinition(
  JSON.stringify(dsl),
  { message_type: "default", metadata: {}, data: JSON.stringify("你好") }
);
console.log("测试结果:", testResult);

// 3. 测试通过后创建
if (testResult.success) {
  const rule = await window.go.rulego.Service.CreateRuleGoRule({
    name: "我的规则链",
    description: "LLM 问答规则链",
    definition: JSON.stringify(dsl),
    editor_json: ""
  });
  console.log("创建成功, ID:", rule.id);
  
  // 4. 执行已保存的规则链
  const result = await window.go.rulego.Service.ExecuteRule(rule.id, {
    message_type: "default",
    metadata: { source: "user" },
    data: JSON.stringify("今天天气怎么样？")
  });
  console.log("执行结果:", result.data);
}
```
