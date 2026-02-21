import Link from "next/link";

/**
 * 404 Not Found page
 * 
 * This is a server component that doesn't use AppLayout to avoid
 * useSearchParams() issues during static generation.
 * The 404 page doesn't need navigation, so we skip AppLayout.
 */
export const dynamic = 'force-dynamic';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-soft p-6 text-center">
        <h1 className="text-4xl font-bold mb-4 text-textPrimary">404</h1>
        <p className="text-lg text-textSecondary mb-6">
          Страница не найдена
        </p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-accent text-white font-medium rounded-xl hover:opacity-90 transition-opacity"
        >
          Вернуться на главную
        </Link>
      </div>
    </div>
  );
}
