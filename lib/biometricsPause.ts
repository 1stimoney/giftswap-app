let paused = false

export const pauseBiometrics = () => {
  paused = true
}

export const resumeBiometrics = () => {
  paused = false
}

export const biometricsPaused = () => paused
