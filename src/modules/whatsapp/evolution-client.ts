import axios, { AxiosInstance, isAxiosError } from 'axios'
import { FastifyBaseLogger } from 'fastify'

export interface EvolutionConnectResponse {
  code?: string
  base64?: string
  pairingCode?: string
  instance?: {
    instanceName?: string
    state?: string
  }
  error?: boolean
  message?: string | string[]
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

  // Connect Instance (gets QR code or connection status)
  async connectInstance(instanceName: string): Promise<EvolutionConnectResponse> {
    this.logger?.debug(`[EvolutionAPI] Connecting instance: ${instanceName}`)

    try {
      const res = await this.httpClient.get<EvolutionConnectResponse>(
        `/instance/connect/${encodeURIComponent(instanceName)}`,
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

  // Get Connection State
  async getConnectionState(instanceName: string): Promise<EvolutionStateResponse> {
    try {
      const res = await this.httpClient.get<EvolutionStateResponse>(
        `/instance/connectionState/${encodeURIComponent(instanceName)}`,
      )
      return res.data
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
}
