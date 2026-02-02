import { useAuth } from '@/authContext'
import { promptBiometric } from '@/lib/biometrics'
import { supabase } from '@/lib/supabase'
import * as SecureStore from 'expo-secure-store'
import React, { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, AppState, AppStateStatus, View } from 'react-native'

const DEVICE_BIO_KEY = 'biometric_enabled_on_device_v1'

export default function BiometricGate({
  children,
}: {
  children: React.ReactNode
}) {
  const { session, initializing } = useAuth()
  const [locked, setLocked] = useState(false)
  const promptingRef = useRef(false)

  const runLockCheck = async () => {
    if (!session?.user) return
    if (promptingRef.current) return

    // device toggle
    const enabledOnDevice =
      (await SecureStore.getItemAsync(DEVICE_BIO_KEY)) === 'true'
    if (!enabledOnDevice) return

    // server preference
    const { data } = await supabase
      .from('security_settings')
      .select('biometric_login')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (!data?.biometric_login) return

    setLocked(true)
    promptingRef.current = true
    const res = await promptBiometric('Unlock GiftSwap')

    promptingRef.current = false
    setLocked(!res.success)
  }

  useEffect(() => {
    if (initializing) return
    if (session?.user) runLockCheck()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initializing, session?.user?.id])

  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state === 'active') {
        runLockCheck()
      }
    }
    const sub = AppState.addEventListener('change', onChange)
    return () => sub.remove()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id])

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size='large' />
      </View>
    )
  }

  if (locked) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size='large' />
      </View>
    )
  }

  return <>{children}</>
}
