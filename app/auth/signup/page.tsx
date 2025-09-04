'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { Loader2, Eye, EyeOff, Mail, Lock, User, Calendar, MapPin } from 'lucide-react';

import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { signInWithGoogleNative } from '@/utils/auth/nativeGoogle';
import { registerDevicePushIfPossible } from '@/utils/push/registerDevice';

export default function SignUp() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const router = useRouter();
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [activityLevel, setActivityLevel] = useState('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [healthGoals, setHealthGoals] = useState<string[]>([]);

  const isNative = Capacitor.getPlatform() === 'android';

  // Get timezone options
  const tzOptions = Intl.supportedValuesOf('timeZone')
    .filter((v, i, a) => !!v && a.indexOf(v) === i);

  // Get reliable timezone
  const getReliableTimeZone = () => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return 'UTC';
    }
  };

  // Set default timezone on mount
  useEffect(() => {
    if (!timezone) {
      setTimezone(getReliableTimeZone());
    }
  }, [timezone]);

  const handleGoogle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (isNative) {
        // Prefer native Google sign-in (Firebase Authentication)
        try {
          const res = await signInWithGoogleNative();
          if (res?.ok) {
            try { await registerDevicePushIfPossible(); } catch {}
            toast.success('Signed in');
            return;
          }
        } catch (e: any) {
          // Fallback to NextAuth Google
          const msg = (e?.message || String(e)).slice(0, 300);
          toast.message(`Native sign-in unavailable: ${msg}`);
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const base = (process.env.NEXT_PUBLIC_AUTH_URL || origin || '').replace(/\/$/, '');
          const authUrl = `${base}/api/auth/signin/google?callbackUrl=${encodeURIComponent(base + '/auth/signup')}`;
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: authUrl, presentationStyle: 'fullscreen' });
        }
      } else {
        const res = await signIn('google', { callbackUrl: '/auth/signup', redirect: false });
        if (res?.url) {
          window.location.assign(res.url);
        }
      }
    } catch (e: any) {
      const msg = e?.message || 'Google sign-in failed. Please try again.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleNativeSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Enhanced validation with specific error messages
    if (!name.trim()) {
      toast.error('Please enter your full name');
      return;
    }

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!password) {
      toast.error('Please enter a password');
      return;
    }

    if (!confirmPassword) {
      toast.error('Please confirm your password');
      return;
    }

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // Enhanced password validation
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      toast.error('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(password)) {
      toast.error('Password must contain at least one lowercase letter');
      return;
    }

    if (!/[0-9]/.test(password)) {
      toast.error('Password must contain at least one number');
      return;
    }

    if (!timezone) {
      toast.error('Please select your timezone');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          name,
          timezone,
          dateOfBirth,
          gender,
          height,
          weight,
          activityLevel,
          dietaryRestrictions,
          healthGoals,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast.success('Account created successfully! Please check your email to verify your account.');
        // Redirect to signin page
        router.push('/auth/signin' as any);
      } else {
        // Handle specific error cases
        if (response.status === 409) {
          toast.error('An account with this email already exists. Please sign in instead.');
        } else if (response.status === 400) {
          // Show the specific validation error from server
          toast.error(data.error || 'Please check your information and try again');
        } else {
          toast.error(data.error || 'Failed to create account. Please try again.');
        }
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast.error('An error occurred during sign up');
    } finally {
      setLoading(false);
    }
  };

  const finish = async () => {
    if (!session?.user?.id) {
      toast.error('Please sign in first');
      return;
    }
    setSaving(true);
    try {
      const isIana = /\//.test(timezone) || timezone === 'UTC';
      let toSave = timezone;
      if (!isIana) {
        const offsetMin = new Date().getTimezoneOffset();
        const totalEast = -offsetMin;
        const mapped = mapOffsetToIana(totalEast);
        toSave = mapped || 'UTC';
      }
      await fetch('/api/preferences', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ timezone: toSave }),
      });
      try { await registerDevicePushIfPossible(); } catch {}
      toast.success('All set!');
      router.replace('/' as any);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save preferences');
    } finally {
      setSaving(false);
    }
  };

  // Helper function for timezone mapping
  const mapOffsetToIana = (offsetMinutes: number) => {
    const offsetHours = offsetMinutes / 60;
    const sign = offsetHours >= 0 ? '+' : '-';
    const absHours = Math.abs(offsetHours);
    return `UTC${sign}${absHours.toString().padStart(2, '0')}:00`;
  };

  // Dietary restrictions options
  const dietaryOptions = [
    'Vegetarian', 'Vegan', 'Gluten-Free', 'Dairy-Free', 
    'Nut-Free', 'Halal', 'Kosher', 'Keto', 'Paleo', 'None'
  ];

  // Health goals options
  const healthGoalOptions = [
    'Weight Loss', 'Weight Gain', 'Muscle Building', 
    'Better Energy', 'Improved Sleep', 'Better Digestion',
    'Heart Health', 'Diabetes Management', 'General Wellness'
  ];

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-br from-green-50 to-blue-100 dark:from-gray-900 dark:to-gray-800 px-4 py-6 sm:py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center mb-8">
          <div className="mb-6">
            <div className="mx-auto h-16 w-16 bg-gradient-to-tr from-green-600 to-blue-600 rounded-2xl flex items-center justify-center mb-4">
              <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
              </svg>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
            Join Nourish
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Create your account and start your wellness journey
          </p>
        </div>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-6 sm:py-8 px-4 sm:px-10 shadow-xl rounded-2xl border border-gray-200 dark:border-gray-700 backdrop-blur-sm">
          {!session ? (
            <div className="space-y-5">
              {/* Google Sign-in Option */}
              <div>
                <Button
                  type="button"
                  onClick={handleGoogle}
                  disabled={loading}
                  className="group relative w-full flex justify-center py-4 px-4 border border-gray-300 dark:border-gray-600 text-base font-semibold rounded-xl text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      {isNative ? 'Sign up with Google' : 'Continue with Google'}
                    </>
                  )}
                </Button>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300 dark:border-gray-600" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">Or create account with email</span>
                </div>
              </div>

              {/* Native Signup Form */}
              <form onSubmit={handleNativeSignup} className="space-y-4">
                <div>
                  <Label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="name"
                      name="name"
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="Enter your full name"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email Address *
                  </Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="Enter your email"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="Create a password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Confirm Password *
                  </Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="pl-10 pr-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="Confirm your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Timezone *
                  </Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <select
                      id="timezone"
                      name="timezone"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="pl-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                    >
                      {tzOptions.map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}{tz === getReliableTimeZone() ? ' (device)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Used to schedule reminders at local times.
                  </p>
                </div>

                <div>
                  <Label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Date of Birth
                  </Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                    <Input
                      id="dateOfBirth"
                      name="dateOfBirth"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="pl-10 block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="gender" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Gender
                  </Label>
                  <select
                    id="gender"
                    name="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                  >
                    <option value="">Select gender</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer-not-to-say">Prefer not to say</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="height" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Height (cm)
                    </Label>
                    <Input
                      id="height"
                      name="height"
                      type="number"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="170"
                    />
                  </div>
                  <div>
                    <Label htmlFor="weight" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Weight (kg)
                    </Label>
                    <Input
                      id="weight"
                      name="weight"
                      type="number"
                      value={weight}
                      onChange={(e) => setWeight(e.target.value)}
                      className="block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                      placeholder="70"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="activityLevel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Activity Level
                  </Label>
                  <select
                    id="activityLevel"
                    name="activityLevel"
                    value={activityLevel}
                    onChange={(e) => setActivityLevel(e.target.value)}
                    className="block w-full appearance-none rounded-xl border border-gray-300 dark:border-gray-600 px-3 py-4 placeholder-gray-400 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 sm:text-sm text-base bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200"
                  >
                    <option value="">Select activity level</option>
                    <option value="sedentary">Sedentary (little or no exercise)</option>
                    <option value="light">Lightly active (light exercise 1-3 days/week)</option>
                    <option value="moderate">Moderately active (moderate exercise 3-5 days/week)</option>
                    <option value="active">Very active (hard exercise 6-7 days/week)</option>
                    <option value="very-active">Extremely active (very hard exercise, physical job)</option>
                  </select>
                </div>

                <div>
                  <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Dietary Restrictions
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {dietaryOptions.map((option) => (
                      <label key={option} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          value={option}
                          checked={dietaryRestrictions.includes(option)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDietaryRestrictions([...dietaryRestrictions, option]);
                            } else {
                              setDietaryRestrictions(dietaryRestrictions.filter(item => item !== option));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Health Goals
                  </Label>
                  <div className="grid grid-cols-2 gap-2">
                    {healthGoalOptions.map((option) => (
                      <label key={option} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          value={option}
                          checked={healthGoals.includes(option)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setHealthGoals([...healthGoals, option]);
                            } else {
                              setHealthGoals(healthGoals.filter(item => item !== option));
                            }
                          }}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{option}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={loading}
                  className="group relative w-full flex justify-center py-4 px-4 border border-transparent text-base font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-3 h-5 w-5" />
                      Creating account...
                    </>
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>

              <div className="text-center">
                <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                  Already have an account?{' '}
                  <a href="/auth/signin" className="font-semibold text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 p-1 -m-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    Sign in
                  </a>
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="timezone" className="block text-sm font-medium text-gray-700 dark:text-gray-200">Timezone</Label>
                <select
                  className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-3 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                >
                  {tzOptions.map((z) => (
                    <option key={z} value={z}>{z}{z === getReliableTimeZone() ? ' (device)' : ''}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Used to schedule reminders at local times.</p>
              </div>
              <Button
                type="button"
                onClick={finish}
                className="w-full py-3 px-4 rounded-lg text-white bg-emerald-600 hover:bg-emerald-700 text-sm font-medium disabled:opacity-60"
                disabled={saving}
              >
                {saving ? 'Finishing…' : 'Finish'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
