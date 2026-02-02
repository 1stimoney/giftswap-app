import * as LocalAuthentication from 'expo-local-authentication'

export async function canUseBiometrics() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const isEnrolled = await LocalAuthentication.isEnrolledAsync()
  return { hasHardware, isEnrolled, ok: hasHardware && isEnrolled }
}

export async function promptBiometric(reason?: string) {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: reason ?? 'Confirm with biometrics',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use passcode',
    disableDeviceFallback: false,
  })
  return res
}
