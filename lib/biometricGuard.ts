import { promptBiometric } from '@/lib/biometrics'

export async function requireBiometric(reason: string) {
  const res = await promptBiometric(reason)

  if (!res.success) {
    throw new Error('BIOMETRIC_CANCELLED')
  }
}
