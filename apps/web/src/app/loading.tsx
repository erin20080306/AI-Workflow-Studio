export default function Loading() {
  return (
    <main className="mx-auto min-h-screen max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
      <div className="skeleton h-10 w-56 rounded-xl" />
      <div className="mt-20 grid gap-8 lg:grid-cols-2">
        <div>
          <div className="skeleton h-5 w-36 rounded-full" />
          <div className="skeleton mt-6 h-20 max-w-xl rounded-2xl" />
          <div className="skeleton mt-4 h-20 max-w-lg rounded-2xl" />
          <div className="skeleton mt-8 h-12 w-44 rounded-full" />
        </div>
        <div className="skeleton h-[28rem] rounded-[2rem]" />
      </div>
    </main>
  );
}
