import { useAuth } from '@/authContext'
import { registerForPushAndSave } from '@/lib/registerPush'
import { Ionicons } from '@expo/vector-icons'
import { Redirect, Tabs } from 'expo-router'
import React, { useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function TabIcon({
  name,
  focused,
  label,
}: {
  name: any
  focused: boolean
  label: string
}) {
  return (
    <View style={[styles.tabItemInner, focused && styles.tabItemInnerActive]}>
      <Ionicons name={name} size={20} color={focused ? '#0f172a' : '#e2e8f0'} />
      {focused ? <Text style={styles.activeLabel}>{label}</Text> : null}
    </View>
  )
}

function FloatingTabBar({ state, descriptors, navigation }: any) {
  const insets = useSafeAreaInsets()

  return (
    <View
      pointerEvents='box-none'
      style={[
        styles.tabBarWrap,
        { paddingBottom: Math.max(insets.bottom, 10) },
      ]}
    >
      <View style={styles.tabBar}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key]
          const focused = state.index === index

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            })
          }

          // You can set these per screen using options.title and options.tabBarIcon
          const label = options.tabBarLabel ?? options.title ?? route.name

          const icon =
            typeof options.tabBarIcon === 'function'
              ? options.tabBarIcon({ focused, color: '', size: 20 })
              : null

          return (
            <Pressable
              key={route.key}
              accessibilityRole='button'
              accessibilityState={focused ? { selected: true } : {}}
              onPress={onPress}
              onLongPress={onLongPress}
              style={[styles.tabItem, focused && styles.tabItemActive]}
            >
              {/* If you prefer to keep it strictly controlled, ignore `icon` and use TabIcon below */}
              {route.name === 'index' ? (
                <TabIcon
                  name={focused ? 'home' : 'home-outline'}
                  focused={focused}
                  label='Home'
                />
              ) : route.name === 'trade' ? (
                <TabIcon
                  name={focused ? 'swap-horizontal' : 'swap-horizontal-outline'}
                  focused={focused}
                  label='Trade'
                />
              ) : route.name === 'withdraw' ? (
                <TabIcon
                  name={focused ? 'cash' : 'cash-outline'}
                  focused={focused}
                  label='Wallet'
                />
              ) : route.name === 'settings' ? (
                <TabIcon
                  name={focused ? 'settings' : 'settings-outline'}
                  focused={focused}
                  label='Settings'
                />
              ) : (
                <TabIcon
                  name={focused ? 'chatbubble' : 'chatbubble-outline'}
                  focused={focused}
                  label='Chat'
                />
              )}
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

export default function TabsLayout() {
  useEffect(() => {
    registerForPushAndSave().then((res) => {
      console.log('🔔 Push register result:', res)
    })
  }, [])

  const { session } = useAuth()

  if (!session) {
    return <Redirect href='/(auth)/login' />
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen
        name='index'
        options={{
          title: 'Home',
        }}
      />
      <Tabs.Screen
        name='trade'
        options={{
          title: 'Trade',
        }}
      />
      <Tabs.Screen
        name='withdraw'
        options={{
          title: 'Withdraw',
        }}
      />
      <Tabs.Screen
        name='settings'
        options={{
          title: 'Settings',
        }}
      />
      <Tabs.Screen
        name='chat'
        options={{
          title: 'Chat',
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: 16,
  },

  // The floating pill
  tabBar: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#0b1220', // dark navy pill like the screenshot
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',

    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },

  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Active gets more width feel naturally because we show label
  tabItemActive: {},

  tabItemInner: {
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },

  tabItemInnerActive: {
    backgroundColor: '#ffffff', // active “bubble”
  },

  activeLabel: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0f172a',
  },
})
