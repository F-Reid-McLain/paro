export default function FloatingButton({ onClick }) {
  return (
    <button onClick={onClick} className="fixed bottom-8 right-8 z-50 rounded-full bg-sky-500 p-4 text-white shadow-lg">
      +
    </button>
  )
}
