import client from './client'

let _cache: Record<string, string> | null = null

export async function getSystemConfig(): Promise<Record<string, string>> {
  if (_cache) return _cache
  const res = await client.get('/tuka/systemConfig/all')
  _cache = res.data.data || {}
  return _cache!
}

export function clearConfigCache() { _cache = null }

export async function getWithdrawalFee(): Promise<number> {
  const cfg = await getSystemConfig()
  return parseFloat(cfg.withdrawal_fee || '50')
}

export async function getWithdrawalMin(): Promise<number> {
  const cfg = await getSystemConfig()
  return parseFloat(cfg.withdrawal_min || '500')
}
