import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#111111] text-white flex flex-col items-center justify-center p-6 text-center select-none">
      <h1 className="text-6xl font-black text-[#E50914] mb-4">404</h1>
      <h2 className="text-2xl font-bold mb-2">Lost your way?</h2>
      <p className="text-[#888888] max-w-md mb-6 text-sm leading-relaxed">
        Sorry, we can&apos;t find that page. You&apos;ll find loads of movies, series, and anime to explore on the home page.
      </p>
      <Link
        href="/"
        className="px-6 py-2.5 bg-white text-black font-bold text-sm rounded hover:bg-[#e6e6e6] transition-colors shadow-lg"
      >
        Rellix Home
      </Link>
    </div>
  );
}
