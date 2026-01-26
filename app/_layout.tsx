import { registerForPushAndSave } from '@/lib/push'
import { supabase } from '@/lib/supabase'
import { Slot } from 'expo-router'
import { useEffect } from 'react'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../authContext'

export default function RootLayout() {
  useEffect(() => {
    const run = async () => {
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        await registerForPushAndSave()
      }
    }
    run()
  }, [])

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Inner />
      </AuthProvider>
    </SafeAreaProvider>
  )
}

function Inner() {
  const { initializing } = useAuth()

  if (initializing) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size='large' color='#2563eb' />
      </View>
    )
  }

  return <Slot />
}

const styles = StyleSheet.create({
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
