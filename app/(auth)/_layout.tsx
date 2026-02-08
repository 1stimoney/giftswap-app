import { Redirect, Stack } from 'expo-router'
import { useAuth } from '../../authContext'

export default function AuthLayout() {
  const { session } = useAuth()

  if (session) {
    return <Redirect href='/(tabs)' />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name='login' />
      <Stack.Screen name='sign-up' />
    </Stack>
  )
}
