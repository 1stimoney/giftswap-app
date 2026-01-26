import React from 'react'
import { RefreshControl, ScrollView } from 'react-native'

export const RefreshScrollView = ({
  refreshing,
  onRefresh,
  children,
}: {
  refreshing: boolean
  onRefresh: () => void
  children: React.ReactNode
}) => {
  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {children}
    </ScrollView>
  )
}
