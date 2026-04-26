export type TServiceName =
  | 'auth'
  | 'firestore'
  | 'rtdb'
  | 'storage'
  | 'functions'
  | 'pubsub'
  | 'rules'

export type TEmulatorStatus = {
  service: TServiceName
  configured: boolean
  running: boolean
  host?: string
  port?: number
  source: 'firebase.json' | 'env' | 'inferred'
}

export type TCommandTarget = {
  service: TServiceName
  projectId?: string
  resourcePath?: string
  identifier?: string
}

export type TFiretoolErrorCode =
  | 'CONTEXT_NOT_FOUND'
  | 'SERVICE_NOT_CONFIGURED'
  | 'EMULATOR_NOT_RUNNING'
  | 'INVALID_INPUT'
  | 'CONFIRMATION_REQUIRED'
  | 'RULE_DENIED'
  | 'AMBIGUOUS_TARGET'

export type TFiretoolError = {
  code: TFiretoolErrorCode
  message: string
  hint?: string
}

export type TFiretoolResult<TResult = unknown> = {
  ok: boolean
  operation: string
  target?: TCommandTarget
  result?: TResult
  warnings: string[]
  error?: TFiretoolError
}
