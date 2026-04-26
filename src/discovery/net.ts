import { createConnection } from 'node:net'

/** Probe whether a TCP port is accepting connections (emulator running check). */
function isPortOpen(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port })
    const done = (result: boolean) => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs)
    socket.on('connect', () => done(true))
    socket.on('timeout', () => done(false))
    socket.on('error', () => done(false))
  })
}

/**
 * Network utilities — extracted to a named object so tests can inject a fake.
 */
export const net = { isPortOpen }
