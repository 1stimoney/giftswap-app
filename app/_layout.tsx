import BiometricGate from '@/component/BiometricsGate'
import { Slot } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../authContext'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <BiometricGate>
          <Inner />
        </BiometricGate>
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
