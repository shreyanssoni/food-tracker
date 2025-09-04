'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '../../components/ui/button';

export default function ToastTest() {
  const [isLoading, setIsLoading] = useState(false);

  const testToast = () => {
    toast.success('This is a success toast!');
  };

  const testErrorToast = () => {
    toast.error('This is an error toast!');
  };

  const testLoadingToast = () => {
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      toast.success('Loading completed!');
    }, 2000);
  };

  return (
    <div className="min-h-screen flex flex-col justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 px-4 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Toast Test
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Test the toast notification system
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow-xl rounded-xl sm:px-10 border border-gray-200 dark:border-gray-700">
          <div className="space-y-4">
            <Button
              onClick={testToast}
              className="w-full py-3 px-4 text-white bg-green-600 hover:bg-green-700"
            >
              Test Success Toast
            </Button>
            
            <Button
              onClick={testErrorToast}
              className="w-full py-3 px-4 text-white bg-red-600 hover:bg-red-700"
            >
              Test Error Toast
            </Button>
            
            <Button
              onClick={testLoadingToast}
              disabled={isLoading}
              className="w-full py-3 px-4 text-white bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? 'Loading...' : 'Test Loading Toast'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
