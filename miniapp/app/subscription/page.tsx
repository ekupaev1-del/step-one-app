import { Suspense } from 'react';
import SubscriptionClient from './SubscriptionClient';

function Loading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">Загрузка...</div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SubscriptionClient />
    </Suspense>
  );
}
