import { createDeepAgent } from 'deepagents'

const agent = createDeepAgent({
  model: 'deepseek:deepseek-v4-pro',
  tools: [],
  systemPrompt:
    'You are a helpful assistant that provides accurate and concise answers to questions.'
})

export default agent
