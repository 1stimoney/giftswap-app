import { supabase } from '@/lib/supabase'
import { FLOATING_TAB_HEIGHT } from '@/lib/ui'
import { Ionicons } from '@expo/vector-icons'
import * as Clipboard from 'expo-clipboard'
import { LinearGradient } from 'expo-linear-gradient'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

type Referral = {
  id: string
  reward_paid: boolean
  created_at: string
  referred_user: {
    username: string | null
    full_name: string | null
  } | null
}

type Profile = {
  referral_code: string | null
}

export default function ReferralsScreen() {
  const insets = useSafeAreaInsets()
  const bottomSpace = FLOATING_TAB_HEIGHT + insets.bottom + 20
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [referrals, setReferrals] = useState<Referral[]>([])

  const fetchData = async () => {
    try {
      setLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) return

      // profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('referral_code')
        .eq('id', user.id)
        .single()

      setProfile(profileData)

      // referrals
      const { data: referralData } = await supabase
        .from('referrals')
        .select(
          `
          id,
          reward_paid,
          created_at,
          referred_user:referred_user_id (
            username,
            full_name
          )
        `,
        )
        .eq('referrer_id', user.id)
        .order('created_at', { ascending: false })

      setReferrals((referralData as unknown as Referral[]) || [])
    } catch (e) {
      console.log(e)
      Alert.alert('Error', 'Failed to load referrals')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const referralCode = profile?.referral_code || 'N/A'

  const totalReferrals = referrals.length

  const successfulReferrals = useMemo(() => {
    return referrals.filter((r) => r.reward_paid).length
  }, [referrals])

  const totalEarned = successfulReferrals * 5000

  const copyCode = async () => {
    await Clipboard.setStringAsync(referralCode)
    Alert.alert('Copied', 'Referral code copied')
  }

  const shareReferral = async () => {
    try {
      await Share.share({
        message: `Join GiftSwap with my referral code: ${referralCode}. Sign up and get ₦3,000 bonus instantly!`,
      })
    } catch {
      //
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <StatusBar style='dark' />
        <ActivityIndicator size='large' color='#2563eb' />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style='dark' backgroundColor='#fff' />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backBtn}
          onPress={() => router.replace('/(tabs)/settings')}
        >
          <Ionicons name='chevron-back' size={22} color='#0f172a' />
        </Pressable>

        <Text style={styles.headerTitle}>Edit Profile</Text>

        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          padding: 18,
          paddingBottom: bottomSpace,
        }}
      >
        {/* HERO */}
        <LinearGradient
          colors={['#0f172a', '#2563eb']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <View style={styles.heroTop}>
            <View style={styles.giftIcon}>
              <Ionicons name='gift-outline' size={24} color='#0f172a' />
            </View>

            <Text style={styles.heroTitle}>Invite & Earn</Text>

            <Text style={styles.heroSub}>
              Invite friends and earn ₦5,000 when they complete a successful
              trade above $100.
            </Text>
          </View>

          <View style={styles.codeCard}>
            <Text style={styles.codeLabel}>YOUR REFERRAL CODE</Text>

            <Text style={styles.codeText}>{referralCode}</Text>

            <View style={styles.actionRow}>
              <Pressable style={styles.copyBtn} onPress={copyCode}>
                <Ionicons name='copy-outline' size={18} color='#fff' />
                <Text style={styles.copyBtnText}>Copy</Text>
              </Pressable>

              <Pressable style={styles.shareBtn} onPress={shareReferral}>
                <Ionicons
                  name='share-social-outline'
                  size={18}
                  color='#0f172a'
                />
                <Text style={styles.shareBtnText}>Share</Text>
              </Pressable>
            </View>
          </View>
        </LinearGradient>

        {/* STATS */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{totalReferrals}</Text>
            <Text style={styles.statLabel}>Total Referrals</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statValue}>{successfulReferrals}</Text>
            <Text style={styles.statLabel}>Successful</Text>
          </View>
        </View>

        <View style={styles.earningsCard}>
          <View style={styles.earningsLeft}>
            <Ionicons name='wallet-outline' size={22} color='#16a34a' />

            <View>
              <Text style={styles.earningsTitle}>Referral Earnings</Text>
              <Text style={styles.earningsSub}>Total rewards received</Text>
            </View>
          </View>

          <Text style={styles.earningsAmount}>
            ₦{totalEarned.toLocaleString()}
          </Text>
        </View>

        {/* HOW IT WORKS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>How it works</Text>

          <View style={styles.infoCard}>
            <Step number='1' text='Share your referral code with friends' />

            <Step number='2' text='They sign up using your code' />

            <Step number='3' text='They get ₦3,000 signup bonus' />

            <Step
              number='4'
              text='You earn ₦5,000 after they complete a trade above $100'
            />
          </View>
        </View>

        {/* REFERRALS LIST */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Referrals</Text>

          {referrals.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name='people-outline' size={34} color='#94a3b8' />
              <Text style={styles.emptyTitle}>No referrals yet</Text>
              <Text style={styles.emptySub}>
                Share your referral code to start earning rewards.
              </Text>
            </View>
          ) : (
            referrals.map((item) => {
              const name =
                item.referred_user?.username ||
                item.referred_user?.full_name ||
                'User'

              return (
                <View key={item.id} style={styles.referralRow}>
                  <View style={styles.referralLeft}>
                    <View style={styles.avatar}>
                      <Ionicons
                        name='person-outline'
                        size={18}
                        color='#0f172a'
                      />
                    </View>

                    <View>
                      <Text style={styles.referralName}>{name}</Text>

                      <Text style={styles.referralDate}>
                        {new Date(item.created_at).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={[
                      styles.badge,
                      item.reward_paid
                        ? styles.badgeSuccess
                        : styles.badgePending,
                    ]}
                  >
                    <Text
                      style={[
                        styles.badgeText,
                        {
                          color: item.reward_paid ? '#166534' : '#b45309',
                        },
                      ]}
                    >
                      {item.reward_paid ? 'Rewarded' : 'Pending'}
                    </Text>
                  </View>
                </View>
              )
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function Step({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepCircle}>
        <Text style={styles.stepNumber}>{number}</Text>
      </View>

      <Text style={styles.stepText}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },

  hero: {
    borderRadius: 26,
    padding: 18,
  },

  heroTop: {
    alignItems: 'center',
  },

  giftIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroTitle: {
    marginTop: 14,
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },

  heroSub: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
  },

  codeCard: {
    marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20,
    padding: 16,
  },

  codeLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
  },

  codeText: {
    marginTop: 8,
    color: '#fff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
  },

  actionRow: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },

  copyBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  copyBtnText: {
    color: '#fff',
    fontWeight: '700',
  },

  shareBtn: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },

  shareBtnText: {
    color: '#0f172a',
    fontWeight: '700',
  },

  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },

  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
  },

  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
  },

  statLabel: {
    marginTop: 4,
    color: '#64748b',
    fontSize: 12,
  },

  earningsCard: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  earningsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  earningsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },

  earningsSub: {
    marginTop: 2,
    fontSize: 12,
    color: '#64748b',
  },

  earningsAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16a34a',
  },

  section: {
    marginTop: 22,
  },

  sectionTitle: {
    marginBottom: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },

  infoCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },

  stepRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },

  stepCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },

  stepNumber: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },

  stepText: {
    flex: 1,
    color: '#0f172a',
    lineHeight: 20,
  },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
  },

  emptyTitle: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },

  emptySub: {
    marginTop: 6,
    textAlign: 'center',
    color: '#64748b',
    lineHeight: 20,
  },

  referralRow: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  referralLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  referralName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },

  referralDate: {
    marginTop: 3,
    fontSize: 12,
    color: '#64748b',
  },

  badge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },

  badgeSuccess: {
    backgroundColor: '#dcfce7',
  },

  badgePending: {
    backgroundColor: '#fef3c7',
  },

  badgeText: {
    fontWeight: '700',
    fontSize: 12,
  },
})
