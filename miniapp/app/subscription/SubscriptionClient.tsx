'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface SubscriptionStatus {
  ok: boolean;
  status: 'trial' | 'active' | 'expired' | null;
  trial_end_at: string | null;
  next_charge_at: string | null;
  price: number;
  is_active: boolean;
}

export default function SubscriptionClient() {
  const searchParams = useSearchParams();
  const userId = searchParams.get('id');
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (userId) {
      loadStatus();
    }
  }, [userId]);

  const loadStatus = async () => {
    try {
      setLoading(true);
      // Get telegram_user_id from users table
      const userResponse = await fetch(`/api/user?id=${userId}`);
      const userData = await userResponse.json();
      
      if (!userData.ok || !userData.telegram_id) {
        console.error('Failed to get user telegram_id');
        return;
      }

      const statusResponse = await fetch(
        `/api/subscription/status?telegramUserId=${userData.telegram_id}`
      );
      const statusData: SubscriptionStatus = await statusResponse.json();
      setStatus(statusData);
    } catch (error) {
      console.error('Error loading subscription status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartTrial = async () => {
    if (!userId || processing) return;

    try {
      setProcessing(true);
      
      // Get telegram_user_id
      const userResponse = await fetch(`/api/user?id=${userId}`);
      const userData = await userResponse.json();
      
      if (!userData.ok || !userData.telegram_id) {
        alert('Ошибка: не удалось получить данные пользователя');
        return;
      }

      // Create trial payment
      const response = await fetch(
        `/api/robokassa/create-trial?telegramUserId=${userData.telegram_id}`
      );
      
      if (!response.ok) {
        const error = await response.json();
        alert(`Ошибка: ${error.error || 'Не удалось создать платеж'}`);
        return;
      }

      // Get HTML form and display it
      const html = await response.text();
      
      // Create a new window with the form
      const newWindow = window.open('', '_blank');
      if (newWindow) {
        newWindow.document.write(html);
        newWindow.document.close();
      } else {
        // Fallback: create iframe
        const iframe = document.createElement('iframe');
        iframe.style.width = '100%';
        iframe.style.height = '600px';
        iframe.style.border = 'none';
        iframe.srcdoc = html;
        document.body.appendChild(iframe);
      }
    } catch (error) {
      console.error('Error starting trial:', error);
      alert('Ошибка при создании платежа');
    } finally {
      setProcessing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Загрузка...</div>
      </div>
    );
  }

  // No active subscription - show paywall
  if (!status || !status.is_active) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-md mx-auto mt-8">
          <h1 className="text-2xl font-bold text-center mb-6">Get full access</h1>
          
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <div className="text-center mb-4">
              <div className="text-3xl font-bold text-gray-900 mb-2">
                Trial 3 days for 1 ₽
              </div>
              <div className="text-gray-600">
                After trial — 199 ₽ per month
              </div>
              <div className="text-sm text-gray-500 mt-2">
                Auto-renewal
              </div>
            </div>
          </div>

          <button
            onClick={handleStartTrial}
            disabled={processing}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {processing ? 'Обработка...' : 'Start trial for 1 ₽'}
          </button>
        </div>
      </div>
    );
  }

  // Has active subscription - show status
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-md mx-auto mt-8">
        <h1 className="text-2xl font-bold text-center mb-6">Subscription</h1>
        
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <div className="text-sm text-gray-500 mb-1">Status</div>
            <div className="text-lg font-semibold capitalize">
              {status.status === 'trial' ? 'Trial' : 'Active'}
            </div>
          </div>

          {status.status === 'trial' && status.trial_end_at && (
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Trial end date</div>
              <div className="text-lg">{formatDate(status.trial_end_at)}</div>
            </div>
          )}

          {status.status === 'active' && status.next_charge_at && (
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-1">Next billing date</div>
              <div className="text-lg">{formatDate(status.next_charge_at)}</div>
            </div>
          )}

          <div className="mb-4">
            <div className="text-sm text-gray-500 mb-1">Price</div>
            <div className="text-lg font-semibold">{status.price} ₽ / month</div>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            To cancel the subscription, contact support at{' '}
            <a
              href="mailto:support@yourdomain.com"
              className="text-blue-600 hover:underline"
            >
              support@yourdomain.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

