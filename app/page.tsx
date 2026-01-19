import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl p-12">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 mb-4">
            TA Demo API
          </h1>
          <p className="text-xl text-gray-600">
            Geofence-to-WhatsApp-to-Reservation Demo Flow
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-12">
          <div className="bg-blue-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-blue-900 mb-2">API Status</h2>
            <p className="text-3xl font-bold text-blue-600">Running</p>
            <p className="text-sm text-blue-700 mt-2">All systems operational</p>
          </div>

          <div className="bg-green-50 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-900 mb-2">Endpoints</h2>
            <p className="text-3xl font-bold text-green-600">6</p>
            <p className="text-sm text-green-700 mt-2">API routes available</p>
          </div>
        </div>

        <div className="space-y-4 mb-12">
          <h3 className="text-lg font-semibold text-gray-900">Quick Links</h3>

          <Link
            href="/dashboard"
            className="block bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg p-4 transition-colors"
          >
            <div className="font-semibold text-lg">Dashboard</div>
            <div className="text-sm text-indigo-100">View real-time stats and activity</div>
          </Link>

          <div className="grid md:grid-cols-2 gap-4">
            <a
              href="/api/dashboard/stats"
              target="_blank"
              className="block bg-gray-100 hover:bg-gray-200 rounded-lg p-4 transition-colors"
            >
              <div className="font-semibold text-gray-900">Stats API</div>
              <div className="text-sm text-gray-600">Get dashboard statistics</div>
            </a>

            <a
              href="/api/dashboard/activity"
              target="_blank"
              className="block bg-gray-100 hover:bg-gray-200 rounded-lg p-4 transition-colors"
            >
              <div className="font-semibold text-gray-900">Activity API</div>
              <div className="text-sm text-gray-600">View recent activity logs</div>
            </a>
          </div>
        </div>

        <div className="border-t pt-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">API Endpoints</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono text-xs">POST</span>
              <code className="text-gray-700">/api/webhooks/geofence-entry</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-green-100 text-green-800 px-2 py-1 rounded font-mono text-xs">POST</span>
              <code className="text-gray-700">/api/whatsapp/button-response</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono text-xs">GET</span>
              <code className="text-gray-700">/api/store-associate/events</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono text-xs">GET</span>
              <code className="text-gray-700">/api/store-associate/reservations</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono text-xs">GET</span>
              <code className="text-gray-700">/api/dashboard/stats</code>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded font-mono text-xs">GET</span>
              <code className="text-gray-700">/api/dashboard/activity</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
