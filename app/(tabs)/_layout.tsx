import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import { StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../../authContext'

export default function TabsLayout() {
  const { session } = useAuth()

  if (!session) {
    return <Redirect href='/(auth)/login' />
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#999',
            tabBarStyle: {
              backgroundColor: '#fff',
              borderTopWidth: 0.5,
              borderTopColor: '#ddd',
              height: 60,
              paddingBottom: 5,
            },
          }}
        >
          <Tabs.Screen
            name='index'
            options={{
              title: 'Home',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name='home-outline' color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name='trade'
            options={{
              title: 'Trade',
              tabBarIcon: ({ color, size }) => (
                <Ionicons
                  name='swap-horizontal-outline'
                  color={color}
                  size={size}
                />
              ),
            }}
          />
          <Tabs.Screen
            name='withdraw'
            options={{
              title: 'Withdraw',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name='cash-outline' color={color} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name='profile'
            options={{
              title: 'Profile',
              tabBarIcon: ({ color, size }) => (
                <Ionicons name='person-outline' color={color} size={size} />
              ),
            }}
          />
        </Tabs>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#000', // keeps it clean across devices
  },
})
