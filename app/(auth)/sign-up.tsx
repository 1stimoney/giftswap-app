import { supabase } from '@/lib/supabase'
import { Link, useRouter } from 'expo-router'
import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

export default function SignUp() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignUp = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username, full_name: fullName },
      },
    })

    if (error) {
      Alert.alert('Signup failed', error.message)
      setLoading(false)
      return
    }

    const user = data.user
    if (user) {
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        full_name: fullName,
        username: username,
        balance: 0,
      })

      if (profileError) console.error('Profile insert error:', profileError)
    }

    Alert.alert('Success', 'Check your email for confirmation link')
    setLoading(false)
    router.replace('/(tabs)')
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.wrapper}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
        keyboardShouldPersistTaps='handled'
      >
        <View style={styles.container}>
          <Text style={styles.title}>Create Your Account</Text>
          <Text style={styles.subtitle}>
            Join GiftSwap and start trading smarter 💳
          </Text>

          <View style={styles.formCard}>
            <TextInput
              style={styles.input}
              placeholder='Full Name'
              onChangeText={setFullName}
              placeholderTextColor={'#888'}
            />
            <TextInput
              style={styles.input}
              placeholder='Username'
              onChangeText={setUsername}
              placeholderTextColor={'#888'}
            />
            <TextInput
              style={styles.input}
              placeholder='Email'
              keyboardType='email-address'
              onChangeText={setEmail}
              placeholderTextColor={'#888'}
              autoCapitalize='none'
            />
            <TextInput
              style={styles.input}
              placeholder='Password'
              secureTextEntry
              onChangeText={setPassword}
              placeholderTextColor={'#888'}
            />

            <TouchableOpacity
              style={[styles.button, loading && { opacity: 0.7 }]}
              onPress={handleSignUp}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Creating...' : 'Sign Up'}
              </Text>
            </TouchableOpacity>

            <Link href='/(auth)/login' asChild>
              <TouchableOpacity style={{ marginTop: 16 }}>
                <Text style={styles.linkText}>
                  Already have an account?{' '}
                  <Text style={styles.linkAccent}>Sign in</Text>
                </Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#f8fafc', // soft gray background
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    color: '#6b7280',
    marginBottom: 20,
    fontSize: 14,
    textAlign: 'center',
  },
  formCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  input: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    borderColor: '#e5e7eb',
    borderWidth: 1,
    width: '100%',
    fontSize: 15,
    color: '#000',
    backgroundColor: '#f9fafb',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  linkText: {
    color: '#6b7280',
    textAlign: 'center',
    fontSize: 14,
  },
  linkAccent: {
    color: '#2563eb',
    fontWeight: '600',
  },
})
