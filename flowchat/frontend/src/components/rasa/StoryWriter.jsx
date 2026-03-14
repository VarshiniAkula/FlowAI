import React, { useState } from 'react'
import apiClient from '../../utils/apiClient.js'

export default function StoryWriter({ onGenerated }) {
  const [story, setStory] = useState('')
  const [projectId, setProjectId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const generate = async () => {
    if (!story.trim()) return
    setLoading(true)
    setError('')
    try {
      const body = {
        story: story.trim(),
        project_id: projectId.trim() || undefined,
      }
      const { data } = await apiClient.post('/rasa/generate', body)
      onGenerated(data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Generation failed. Check your ANTHROPIC_API_KEY.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-sm font-semibold text-gray-800">Story Writer</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Describe your virtual assistant in plain English. The system will generate
          all RASA NLU files automatically.
        </p>
      </div>

      {/* Story input */}
      <div className="flex-1 px-6 py-4 overflow-y-auto">
        <label className="block text-xs font-medium text-gray-600 mb-2">
          Project Name (optional)
        </label>
        <input
          value={projectId}
          onChange={(e) => setProjectId(e.target.value.replace(/\s+/g, '_').toLowerCase())}
          placeholder="e.g. hotel_booking_bot"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <label className="block text-xs font-medium text-gray-600 mb-2">
          Describe your assistant's conversation flows
        </label>
        <textarea
          value={story}
          onChange={(e) => setStory(e.target.value)}
          rows={14}
          placeholder={`Example:

I want a hotel booking assistant that:

1. Greets the user and asks how it can help
2. Understands when users want to book a room, cancel a booking, or ask about amenities
3. For booking: asks for check-in date, check-out date, number of guests, and room type (standard, deluxe, suite)
4. Confirms the booking details before finalizing
5. For cancellations: asks for the booking reference number, confirms cancellation
6. For amenities: provides info about pool, gym, restaurant, and spa
7. Handles small talk and out-of-scope questions gracefully
8. Says goodbye politely`}
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none font-mono"
        />

        {error && (
          <div className="mt-3 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <button
          onClick={generate}
          disabled={loading || !story.trim()}
          className="w-full px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Generating RASA files...
            </>
          ) : 'Generate RASA Files'}
        </button>
      </div>
    </div>
  )
}
