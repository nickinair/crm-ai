/** 开放给智能体平台的数据默认脱敏（§11.2）：手机号、车架号、车牌只保留首尾 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  return d.length >= 7 ? `${d.slice(0, 3)}****${d.slice(-4)}` : '****';
}

export function maskVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  return vin.length > 8 ? `${vin.slice(0, 4)}${'*'.repeat(vin.length - 8)}${vin.slice(-4)}` : '****';
}

export function maskPlate(plate: string | null | undefined): string | null {
  if (!plate) return null;
  return plate.length > 3 ? `${plate.slice(0, 2)}${'*'.repeat(plate.length - 3)}${plate.slice(-1)}` : '***';
}

/** 只取数字：群名里的手机号可能带空格、横线 */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}
