import axios, { AxiosInstance, isAxiosError } from 'axios'
import { FastifyBaseLogger } from 'fastify'

export interface EvolutionConnectResponse {
  code?: string
  base64?: string
  pairingCode?: string
  qrcode?: {
    code?: string
    base64?: string
  }
  instance?: {
    instanceName?: string
    state?: string
  }
  error?: boolean
  message?: string | string[]
  [key: string]: unknown
}

export function extractQrFromResponse(res: EvolutionConnectResponse): string | undefined {
  if (!res) return undefined
  // Prioritize base64 image data URL from Evolution API
  const base64 = res.base64 || res.qrcode?.base64
  if (base64 && typeof base64 === 'string') {
    return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
  }
  // Fallback to raw code string
  const code = res.code || res.qrcode?.code
  if (code && typeof code === 'string') {
    return code
  }
  return undefined
}

export interface EvolutionStateResponse {
  instance?: {
    instanceName?: string
    state?: string
  }
}

export interface EvolutionGenericResponse {
  message?: string | string[]
  error?: string | boolean
  [key: string]: unknown
}

export class EvolutionClient {
  private httpClient: AxiosInstance
  private logger?: FastifyBaseLogger

  constructor(baseUrl: string, globalApiKey: string, logger?: FastifyBaseLogger) {
    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    this.logger = logger
    this.httpClient = axios.create({
      baseURL: cleanBaseUrl,
      headers: {
        'Content-Type': 'application/json',
        apikey: globalApiKey,
      },
    })
  }

  // Create Instance in Evolution API
  async createInstance(instanceName: string): Promise<unknown> {
    this.logger?.info(`[EvolutionAPI] Creating instance: ${instanceName}`)

    try {
      const res = await this.httpClient.post('/instance/create', {
        instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      })
      return res.data
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        this.logger?.warn(
          `[EvolutionAPI] Create instance returned HTTP ${err.response.status}: ${JSON.stringify(err.response.data)}`,
        )
        return err.response.data
      }
      this.logger?.error(err as Error, `[EvolutionAPI] Failed to create instance ${instanceName}`)
      throw err
    }
  }

  // Connect Instance (gets fresh QR code or connection status)
  async connectInstance(instanceName: string): Promise<EvolutionConnectResponse> {
    this.logger?.debug(`[EvolutionAPI] Connecting instance: ${instanceName}`)

    try {
      const res = await this.httpClient.get<EvolutionConnectResponse>(
        `/instance/connect/${encodeURIComponent(instanceName)}?t=${Date.now()}`,
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            Expires: '0',
          },
        },
      )
      return res.data
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        return err.response.data as EvolutionConnectResponse
      }
      this.logger?.error(err as Error, `[EvolutionAPI] Failed to connect instance ${instanceName}`)
      throw err
    }
  }

  // Restart Instance (forces Evolution API to re-initialize WhatsApp socket & generate new QR)
  async restartInstance(instanceName: string): Promise<unknown> {
    this.logger?.info(`[EvolutionAPI] Restarting instance: ${instanceName}`)

    try {
      const res = await this.httpClient.post(
        `/instance/restart/${encodeURIComponent(instanceName)}`,
        {},
        {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
          },
        },
      )
      return res.data
    } catch (err) {
      this.logger?.warn(`[EvolutionAPI] Failed to restart instance ${instanceName}: ${err}`)
    }
  }

  // Get Connection State
  async getConnectionState(instanceName: string): Promise<EvolutionStateResponse> {
    try {
      const res = await this.httpClient.get<Record<string, unknown>>(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      )
      const data = res.data as {
        instance?: { state?: string }
        state?: string
        status?: string
        connectionStatus?: { state?: string }
      }
      const state =
        data?.instance?.state ||
        data?.state ||
        data?.status ||
        data?.connectionStatus?.state ||
        'close'

      return {
        instance: {
          instanceName,
          state,
        },
      }
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 404) {
        return { instance: { instanceName, state: 'close' } }
      }
      this.logger?.error(
        err as Error,
        `[EvolutionAPI] Failed to fetch connection state for ${instanceName}`,
      )
      return { instance: { instanceName, state: 'close' } }
    }
  }

  // Logout Instance
  async logoutInstance(instanceName: string): Promise<unknown> {
    this.logger?.info(`[EvolutionAPI] Logging out instance: ${instanceName}`)

    try {
      const res = await this.httpClient.delete(
        `/instance/logout/${encodeURIComponent(instanceName)}`,
      )
      return res.data
    } catch (err) {
      this.logger?.error(err as Error, `[EvolutionAPI] Failed to logout instance ${instanceName}`)
    }
  }

  // Delete Instance
  async deleteInstance(instanceName: string): Promise<unknown> {
    this.logger?.info(`[EvolutionAPI] Deleting instance: ${instanceName}`)

    try {
      const res = await this.httpClient.delete(
        `/instance/delete/${encodeURIComponent(instanceName)}`,
      )
      return res.data
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        this.logger?.error(
          `[EvolutionAPI] Delete instance ${instanceName} failed (HTTP ${err.response.status}): ${JSON.stringify(err.response.data)}`,
        )
        return err.response.data
      }
      this.logger?.error(err as Error, `[EvolutionAPI] Failed to delete instance ${instanceName}`)
      throw err
    }
  }

  // Send Text Message
  async sendTextMessage(instanceName: string, to: string, text: string): Promise<unknown> {
    this.logger?.info(`[EvolutionAPI] Sending message via instance ${instanceName} to ${to}`)

    // Format destination number: clean @s.whatsapp.net if present
    const cleanNumber = to.replace(/@s\.whatsapp\.net$/, '')

    try {
      const res = await this.httpClient.post<EvolutionGenericResponse>(
        `/message/sendText/${encodeURIComponent(instanceName)}`,
        {
          number: cleanNumber,
          text,
        },
      )
      return res.data
    } catch (err) {
      if (isAxiosError(err) && err.response) {
        const data = err.response.data as EvolutionGenericResponse
        const errorMsg = data?.message || data?.error || err.message
        throw new Error(`Evolution API error (${err.response.status}): ${JSON.stringify(errorMsg)}`)
      }
      throw err
    }
  }

  // Helper to extract clean phone number from string
  private extractPhoneNumber(raw: unknown): string | null {
    if (!raw || typeof raw !== 'string') return null
    const clean = raw.split('@')[0].replace(/[^0-9]/g, '')
    return clean && clean.length >= 7 ? clean : null
  }

  // Fetch Instance Info & Owner Phone Number
  async getInstanceOwner(instanceName: string): Promise<string | null> {
    try {
      const res = await this.httpClient.get<unknown>(
        `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`,
      )
      const data = res.data
      let targetObj: Record<string, unknown> | null = null

      if (Array.isArray(data) && data.length > 0) {
        targetObj =
          (data.find(
            (item: Record<string, unknown>) =>
              item?.instanceName === instanceName ||
              item?.name === instanceName ||
              (item?.instance as Record<string, unknown>)?.instanceName === instanceName,
          ) as Record<string, unknown>) || (data[0] as Record<string, unknown>)
      } else if (data && typeof data === 'object') {
        const obj = data as Record<string, unknown>
        if (Array.isArray(obj.instances) && obj.instances.length > 0) {
          targetObj =
            (obj.instances.find(
              (item: Record<string, unknown>) =>
                item?.instanceName === instanceName || item?.name === instanceName,
            ) as Record<string, unknown>) || (obj.instances[0] as Record<string, unknown>)
        } else {
          targetObj = obj
        }
      }

      if (targetObj) {
        const candidate =
          targetObj.owner ||
          targetObj.ownerJid ||
          targetObj.number ||
          targetObj.profileJid ||
          (targetObj.instance as Record<string, unknown>)?.owner ||
          (targetObj.instance as Record<string, unknown>)?.ownerJid ||
          (targetObj.connectionStatus as Record<string, unknown>)?.owner

        const phone = this.extractPhoneNumber(candidate)
        if (phone) return phone
      }
    } catch (err) {
      this.logger?.warn(`[EvolutionAPI] Failed to fetch instance owner for ${instanceName}: ${err}`)
    }

    // Fallback: Check connectionState response
    try {
      const stateRes = await this.getConnectionState(instanceName)
      const instanceData = stateRes.instance as Record<string, unknown> | undefined
      const candidate = instanceData?.owner || instanceData?.ownerJid
      const phone = this.extractPhoneNumber(candidate)
      if (phone) return phone
    } catch {
      // ignore
    }

    return null
  }
}
