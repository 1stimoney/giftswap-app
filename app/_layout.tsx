import BiometricGate from '@/component/BiometricsGate'
import { Slot } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider, useAuth } from '../authContext'

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <BiometricGate>
            <Inner />
          </BiometricGate>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
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
