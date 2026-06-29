export default function FloatingButton({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ bottom: 'var(--fab-bottom)' }}
      className="fixed right-5 sm:right-8 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-sky-500 text-2xl leading-none text-white shadow-lg"
    >
      +
    </button>
  )
}
