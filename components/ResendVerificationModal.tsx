import React, { useState } from 'react';
import { Mail, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui/modal';
import { Button } from './ui/button';

interface ResendVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  email: string;
}

export function ResendVerificationModal({ isOpen, onClose, email }: ResendVerificationModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleResendVerification = async () => {
    if (!email) {
      toast.error('Email address is required');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        setEmailSent(true);
        toast.success('Verification email sent successfully!');
      } else {
        const data = await response.json();
        toast.error(data.error || 'Failed to send verification email');
      }
    } catch (error) {
      console.error('Error resending verification:', error);
      toast.error('An error occurred while sending the verification email');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setEmailSent(false);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Email Verification Required">
      <div className="text-center">
        {!emailSent ? (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-yellow-100 dark:bg-yellow-900/20 mb-4">
              <Mail className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
            </div>
            
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Please verify your email
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              You need to verify your email address before you can sign in. We&apos;ll send a verification link to:
            </p>
            
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 mb-6">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {email}
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleResendVerification}
                disabled={isLoading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Resend verification email
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleClose}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 dark:bg-green-900/20 mb-4">
              <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Verification email sent!
            </h3>
            
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
              We&apos;ve sent a verification link to <strong>{email}</strong>. Please check your inbox and click the link to verify your account.
            </p>
            
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Tip:</strong> If you don&apos;t see the email, check your spam folder. The email should arrive within a few minutes.
              </p>
            </div>
            
            <Button
              onClick={handleClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              Got it
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
