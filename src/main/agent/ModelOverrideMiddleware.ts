import { createMiddleware, initChatModel, type AgentMiddleware } from 'langchain'
import type { ModelService } from '../model/ModelService'

/**
 * 模型覆盖中间件：运行期按会话选择的模型替换默认模型（无需重建 agent）
 *
 * 链路：agent:send 把自定义模型 id 放入 streamEvents 的 configurable.model_override
 * → langgraph 运行期 wrapModelCall 钩子读到该 id → ModelService 取凭据
 * → initChatModel(id, { modelProvider: 'openai', apiKey, configuration: { baseURL } })
 * → handler({ ...request, model }) 用自定义模型完成本次调用（官方 modelFallback 同款姿势）
 *
 * - 凭据只存在于中间件内构造的模型实例内存，不进 configurable（避免被写入 checkpoint）
 * - 记录被删/伪造 id → 回退默认模型，不打断流
 * - 无 model_override 时零开销直接转发，行为与未注册中间件一致
 * - deepagents 内置 task 子代理有独立中间件链，不跟随自定义模型（v1 已知限制）
 */
export function createModelOverrideMiddleware(modelService: ModelService): AgentMiddleware {
  return createMiddleware({
    name: 'modelOverrideMiddleware',
    wrapModelCall: async (request, handler) => {
      const cfg = request.runtime?.configurable
      const modelId = typeof cfg?.model_override === 'string' ? cfg.model_override : undefined
      if (!modelId) return handler(request)
      const cred = modelService.getCredential(modelId)
      if (!cred) return handler(request)
      // 端点 → OpenAI 兼容 baseURL（ChatOpenAI 内部拼接 /chat/completions）
      const baseURL = cred.url.replace(/\/chat\/completions$/, '')
      // id 即 API 模型标识（name 是显示名，可被用户手改美化，不作为 API 参数）
      const model = await initChatModel(cred.id, {
        modelProvider: 'openai',
        apiKey: cred.apiKey,
        configuration: { baseURL }
      })
      return handler({ ...request, model })
    }
  })
}
