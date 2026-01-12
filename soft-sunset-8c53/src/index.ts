/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

// Helper function to escape HTML and prevent XSS
function escapeHtml(text: string | null | undefined): string {
	if (text === null || text === undefined) return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);

		// Handle GET /search endpoint - AI-powered semantic search
		if (request.method === 'GET' && url.pathname === '/search') {
			try {
				const searchParams = new URL(request.url).searchParams;
				const query = searchParams.get('q') || '';

				if (!query.trim()) {
					return new Response(
						JSON.stringify({ error: 'Search query is required' }),
						{
							status: 400,
							headers: { 'Content-Type': 'application/json' }
						}
					);
				}

				// Get all feedback records
				const allRecords = await env.DB.prepare(
					'SELECT * FROM feedback ORDER BY created_at DESC'
				).all<{
					id: number;
					source: string;
					content: string;
					sentiment: string | null;
					tags: string | null;
					created_at: string;
				}>();

				const allFeedback = allRecords.results || [];

				if (allFeedback.length === 0) {
					return new Response(
						JSON.stringify({ results: [], query }),
						{
							status: 200,
							headers: { 'Content-Type': 'application/json' }
						}
					);
				}

				// Use AI to semantically match feedback against the search query
				// Create a prompt that helps AI score relevance
				const feedbackList = allFeedback.map((fb, idx) => 
					`[${idx}] ${fb.content}`
				).join('\n');

				const searchPrompt = `You are a search assistant. Given a search query and a list of feedback entries, identify which feedback entries are most relevant to the query.

Search Query: "${query}"

Feedback Entries:
${feedbackList}

Return ONLY a JSON array of the indices (numbers in brackets) of the most relevant feedback entries, ordered by relevance (most relevant first). Include at least the top 5 most relevant entries, or all entries if there are fewer than 5.

Example format: [0, 3, 1, 5, 2]
Return only the JSON array, no other text.`;

				const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
					prompt: searchPrompt,
					max_tokens: 200,
					temperature: 0.1,
				});

				// Extract indices from AI response
				const aiText = aiResponse.response || '';
				let relevantIndices: number[] = [];

				try {
					// Try to extract JSON array from response
					const jsonMatch = aiText.match(/\[[\s\S]*?\]/);
					if (jsonMatch) {
						relevantIndices = JSON.parse(jsonMatch[0]);
					} else {
						// Fallback: try to parse the entire response
						relevantIndices = JSON.parse(aiText.trim());
					}
				} catch {
					// If AI parsing fails, fall back to simple text matching
					const queryLower = query.toLowerCase();
					relevantIndices = allFeedback
						.map((fb, idx) => ({
							idx,
							score: (fb.content.toLowerCase().includes(queryLower) ? 1 : 0) +
								(fb.tags?.toLowerCase().includes(queryLower) ? 0.5 : 0)
						}))
						.filter(item => item.score > 0)
						.sort((a, b) => b.score - a.score)
						.map(item => item.idx);
				}

				// Ensure indices are valid and get unique results
				const validIndices = [...new Set(relevantIndices)]
					.filter((idx: number) => idx >= 0 && idx < allFeedback.length)
					.slice(0, 20); // Limit to top 20 results

				const searchResults = validIndices.map((idx: number) => allFeedback[idx]);

				return new Response(
					JSON.stringify({ results: searchResults, query, total: searchResults.length }),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			} catch (error) {
				return new Response(
					JSON.stringify({
						error: 'Search failed',
						message: error instanceof Error ? error.message : String(error)
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
		}

		// Handle GET / endpoint - display feedback records
		if (request.method === 'GET' && url.pathname === '/') {
			try {
				const searchParams = new URL(request.url).searchParams;
				const searchQuery = searchParams.get('q') || '';

				// Query all feedback records, ordered by created_at descending
				const records = await env.DB.prepare(
					'SELECT * FROM feedback ORDER BY created_at DESC'
				).all<{
					id: number;
					source: string;
					content: string;
					sentiment: string | null;
					tags: string | null;
					created_at: string;
				}>();

				let feedbackRecords = records.results || [];

				// If there's a search query, filter results using AI search
				if (searchQuery.trim() && feedbackRecords.length > 0) {
					try {
						// Use AI to find relevant feedback
						const feedbackList = feedbackRecords.map((fb, idx) => 
							`[${idx}] ${fb.content}`
						).join('\n');

						const searchPrompt = `You are a search assistant. Given a search query and a list of feedback entries, identify which feedback entries are most relevant to the query.

Search Query: "${searchQuery}"

Feedback Entries:
${feedbackList}

Return ONLY a JSON array of the indices (numbers in brackets) of the most relevant feedback entries, ordered by relevance (most relevant first). Include at least the top 10 most relevant entries, or all entries if there are fewer than 10.

Example format: [0, 3, 1, 5, 2]
Return only the JSON array, no other text.`;

						const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
							prompt: searchPrompt,
							max_tokens: 200,
							temperature: 0.1,
						});

						const aiText = aiResponse.response || '';
						let relevantIndices: number[] = [];

						try {
							const jsonMatch = aiText.match(/\[[\s\S]*?\]/);
							if (jsonMatch) {
								relevantIndices = JSON.parse(jsonMatch[0]);
							} else {
								relevantIndices = JSON.parse(aiText.trim());
							}
						} catch {
							// Fallback to simple text matching
							const queryLower = searchQuery.toLowerCase();
							relevantIndices = feedbackRecords
								.map((fb, idx) => ({
									idx,
									score: (fb.content.toLowerCase().includes(queryLower) ? 1 : 0) +
										(fb.tags?.toLowerCase().includes(queryLower) ? 0.5 : 0)
								}))
								.filter(item => item.score > 0)
								.sort((a, b) => b.score - a.score)
								.map(item => item.idx);
						}

						const validIndices = [...new Set(relevantIndices)]
							.filter((idx: number) => idx >= 0 && idx < feedbackRecords.length);

						if (validIndices.length > 0) {
							feedbackRecords = validIndices.map((idx: number) => feedbackRecords[idx]);
						} else {
							feedbackRecords = [];
						}
					} catch (error) {
						// If AI search fails, fall back to showing all results
						console.error('Search error:', error);
					}
				}

				// Query unique source values from existing records
				const uniqueSourcesResult = await env.DB.prepare(
					'SELECT DISTINCT source FROM feedback ORDER BY source'
				).all<{ source: string }>();

				const existingSources = (uniqueSourcesResult.results || []).map(r => r.source);
				
				// Common source options
				const commonSources = [
					'Email',
					'Website',
					'App Store',
					'Google Play',
					'Support Ticket',
					'Social Media',
					'Survey',
					'In-App Feedback',
					'Phone Call',
					'Chat Support'
				];

				// Combine common sources with existing sources, remove duplicates, and sort
				const allSources = [...new Set([...commonSources, ...existingSources])].sort();

				// Generate HTML with Cloudflare Dashboard theme
				const html = `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Product Feedback Analyzer</title>
	<script src="https://cdn.tailwindcss.com"></script>
	<style>
		body {
			background-color: #0D1117;
			color: #E6EDF3;
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif;
		}
		.cloudflare-orange {
			background-color: #F6821F;
		}
		.cloudflare-orange:hover {
			background-color: #E6730C;
		}
		.cloudflare-dark {
			background-color: #161B22;
		}
		.cloudflare-border {
			border-color: #30363D;
		}
		.cloudflare-input {
			background-color: #0D1117;
			border-color: #30363D;
			color: #E6EDF3;
		}
		.cloudflare-input:focus {
			border-color: #F6821F;
			outline: none;
			box-shadow: 0 0 0 3px rgba(246, 130, 31, 0.1);
		}
		.cloudflare-input::placeholder {
			color: #7D8590;
		}
		select.cloudflare-input {
			cursor: pointer;
		}
		select.cloudflare-input option {
			background-color: #0D1117;
			color: #E6EDF3;
		}
		.cloudflare-table-header {
			background-color: #161B22;
			border-color: #30363D;
		}
		.cloudflare-table-row {
			border-color: #21262D;
		}
		.cloudflare-table-row:hover {
			background-color: #161B22;
		}
	</style>
</head>
<body class="min-h-screen py-8">
	<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
		<!-- Header -->
		<div class="mb-6">
			<h1 class="text-3xl font-semibold text-white mb-2">Product Feedback Analyzer</h1>
			<p class="text-sm text-gray-400">Analyze and manage product feedback using Workers AI</p>
		</div>

		<!-- Feedback Submission Form Card -->
		<div class="cloudflare-dark rounded-lg border cloudflare-border p-6 mb-6">
			<h2 class="text-lg font-semibold text-white mb-4">Submit New Feedback</h2>
			
			<form id="feedbackForm" class="space-y-4">
				<div>
					<label for="source" class="block text-sm font-medium text-gray-300 mb-2">Source</label>
					<select 
						id="source" 
						name="source" 
						required
						class="cloudflare-input w-full px-3 py-2 border rounded-md text-sm"
					>
						<option value="">Select a source...</option>
						${allSources.map(source => `<option value="${escapeHtml(source)}">${escapeHtml(source)}</option>`).join('')}
					</select>
				</div>
				<div>
					<label for="feedback_text" class="block text-sm font-medium text-gray-300 mb-2">Feedback</label>
					<textarea 
						id="feedback_text" 
						name="feedback_text" 
						required
						rows="4"
						placeholder="Enter your product feedback here..."
						class="cloudflare-input w-full px-3 py-2 border rounded-md text-sm resize-none"
					></textarea>
				</div>
				<button 
					type="submit"
					class="cloudflare-orange w-full text-white py-2.5 px-4 rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 font-medium transition-all text-sm"
				>
					Analyze Feedback
				</button>
			</form>
			
			<div id="message" class="hidden mt-4 p-4 rounded-md text-sm"></div>
		</div>

		<!-- AI Search Card -->
		<div class="cloudflare-dark rounded-lg border cloudflare-border p-6 mb-6">
			<h2 class="text-lg font-semibold text-white mb-4">AI-Powered Search</h2>
			<div class="flex gap-2">
				<input 
					type="text" 
					id="searchInput" 
					placeholder="Search feedback semantically (e.g., 'login issues', 'pricing concerns', 'UI improvements')..."
					value="${escapeHtml(searchQuery)}"
					class="cloudflare-input flex-1 px-3 py-2 border rounded-md text-sm"
				/>
				<button 
					id="searchButton"
					class="cloudflare-orange text-white py-2 px-6 rounded-md hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-gray-900 font-medium transition-all text-sm whitespace-nowrap"
				>
					Search
				</button>
				${searchQuery ? `<button 
					id="clearSearch"
					class="bg-gray-700 text-white py-2 px-4 rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:ring-offset-gray-900 font-medium transition-all text-sm"
				>
					Clear
				</button>` : ''}
			</div>
			<div id="searchMessage" class="hidden mt-4 p-4 rounded-md text-sm"></div>
		</div>

		<!-- Feedback Records Table Card -->
		<div class="cloudflare-dark rounded-lg border cloudflare-border overflow-hidden">
			<div class="px-6 py-4 border-b cloudflare-border">
				<h2 class="text-lg font-semibold text-white">Feedback Records</h2>
				<p class="text-xs text-gray-400 mt-1">${feedbackRecords.length} ${feedbackRecords.length === 1 ? 'record' : 'records'}${searchQuery ? ` (filtered by: "${escapeHtml(searchQuery)}")` : ''}</p>
			</div>
			<div class="overflow-x-auto">
				<table class="min-w-full divide-y cloudflare-table-row">
					<thead class="cloudflare-table-header">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">ID</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Source</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Content</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Sentiment</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Tags</th>
							<th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Created At</th>
						</tr>
					</thead>
					<tbody class="divide-y cloudflare-table-row">
						${feedbackRecords.length === 0 
							? `<tr><td colspan="6" class="px-6 py-8 text-center text-gray-400 text-sm">No feedback records yet. Submit your first feedback above!</td></tr>`
							: feedbackRecords.map(record => {
								const sentimentColor = 
									record.sentiment === 'Positive' ? 'bg-green-900/30 text-green-400 border-green-800/50' :
									record.sentiment === 'Negative' ? 'bg-red-900/30 text-red-400 border-red-800/50' :
									'bg-yellow-900/30 text-yellow-400 border-yellow-800/50';
								const createdDate = new Date(record.created_at).toLocaleString();
								
								// Process tags: split by comma, trim, capitalize, and create badges
								let tagsDisplay = '<span class="text-gray-400 text-sm">N/A</span>';
								if (record.tags && record.tags.trim()) {
									const tags = record.tags
										.split(',')
										.map(tag => tag.trim())
										.filter(tag => tag.length > 0)
										.map(tag => {
											// Capitalize first letter of each word
											const capitalized = tag
												.split(' ')
												.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
												.join(' ');
											return `<span class="px-2 py-1 inline-flex text-xs font-medium rounded bg-gray-800/50 text-gray-300 border border-gray-700/50 mr-1.5 mb-1">${escapeHtml(capitalized)}</span>`;
										})
										.join('');
									tagsDisplay = `<div class="flex flex-wrap gap-1">${tags}</div>`;
								}
								
								return `
								<tr class="cloudflare-table-row">
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${record.id}</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">${escapeHtml(record.source)}</td>
									<td class="px-6 py-4 text-sm text-gray-300 max-w-md">${escapeHtml(record.content)}</td>
									<td class="px-6 py-4 whitespace-nowrap">
										<span class="px-2.5 py-1 inline-flex text-xs leading-5 font-medium rounded border ${sentimentColor}">
											${escapeHtml(record.sentiment || 'N/A')}
										</span>
									</td>
									<td class="px-6 py-4">${tagsDisplay}</td>
									<td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${escapeHtml(createdDate)}</td>
								</tr>
								`;
							}).join('')
						}
					</tbody>
				</table>
			</div>
		</div>
	</div>

	<script>
		document.getElementById('feedbackForm').addEventListener('submit', async (e) => {
			e.preventDefault();
			
			const form = e.target;
			const formData = new FormData(form);
			const source = formData.get('source');
			const feedback_text = formData.get('feedback_text');
			
			const messageDiv = document.getElementById('message');
			messageDiv.classList.remove('hidden');
			messageDiv.className = 'mt-4 p-4 rounded-md text-sm bg-blue-900/30 text-blue-300 border border-blue-800/50';
			messageDiv.textContent = 'Analyzing feedback...';
			
			try {
				const response = await fetch('/analyze', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({ source, feedback_text })
				});
				
				const data = await response.json();
				
				if (response.ok) {
					messageDiv.className = 'mt-4 p-4 rounded-md text-sm bg-green-900/30 text-green-300 border border-green-800/50';
					messageDiv.textContent = 'Feedback analyzed and saved successfully! Reloading...';
					form.reset();
					setTimeout(() => {
						window.location.reload();
					}, 1000);
				} else {
					messageDiv.className = 'mt-4 p-4 rounded-md text-sm bg-red-900/30 text-red-300 border border-red-800/50';
					messageDiv.textContent = 'Error: ' + (data.error || 'Failed to analyze feedback');
				}
			} catch (error) {
				messageDiv.className = 'mt-4 p-4 rounded-md text-sm bg-red-900/30 text-red-300 border border-red-800/50';
				messageDiv.textContent = 'Error: ' + error.message;
			}
		});

		// Search functionality
		const searchInput = document.getElementById('searchInput');
		const searchButton = document.getElementById('searchButton');
		const clearSearch = document.getElementById('clearSearch');
		const searchMessage = document.getElementById('searchMessage');

		async function performSearch(query) {
			if (!query.trim()) {
				window.location.href = '/';
				return;
			}

			searchMessage.classList.remove('hidden');
			searchMessage.className = 'mt-4 p-4 rounded-md text-sm bg-blue-900/30 text-blue-300 border border-blue-800/50';
			searchMessage.textContent = 'Searching with AI...';

			try {
				const response = await fetch('/search?q=' + encodeURIComponent(query));
				const data = await response.json();

				if (response.ok && data.results) {
					// Reload page to show filtered results
					window.location.href = '/?q=' + encodeURIComponent(query);
				} else {
					searchMessage.className = 'mt-4 p-4 rounded-md text-sm bg-red-900/30 text-red-300 border border-red-800/50';
					searchMessage.textContent = 'Error: ' + (data.error || 'Search failed');
				}
			} catch (error) {
				searchMessage.className = 'mt-4 p-4 rounded-md text-sm bg-red-900/30 text-red-300 border border-red-800/50';
				searchMessage.textContent = 'Error: ' + error.message;
			}
		}

		if (searchButton) {
			searchButton.addEventListener('click', () => {
				const query = searchInput.value.trim();
				performSearch(query);
			});
		}

		if (searchInput) {
			searchInput.addEventListener('keypress', (e) => {
				if (e.key === 'Enter') {
					const query = searchInput.value.trim();
					performSearch(query);
				}
			});
		}

		if (clearSearch) {
			clearSearch.addEventListener('click', () => {
				window.location.href = '/';
			});
		}
	</script>
</body>
</html>`;

				return new Response(html, {
					headers: { 'Content-Type': 'text/html' }
				});
			} catch (error) {
				return new Response(
					`<html><body><h1>Error</h1><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p></body></html>`,
					{
						status: 500,
						headers: { 'Content-Type': 'text/html' }
					}
				);
			}
		}

		// Handle POST /analyze endpoint
		if (request.method === 'POST' && url.pathname === '/analyze') {
			try {
				// Parse request body
				const body = await request.json() as { feedback_text?: string; source?: string };
				
				if (!body.feedback_text || !body.source) {
					return new Response(
						JSON.stringify({ error: 'Missing required fields: feedback_text and source' }),
						{ 
							status: 400,
							headers: { 'Content-Type': 'application/json' }
						}
					);
				}

				// Analyze feedback using Workers AI
				const prompt = `Analyze the following product feedback and return ONLY a valid JSON object with two fields:
1. "sentiment" - one of: "Positive", "Neutral", or "Negative"
2. "tags" - a comma-separated string of the top 3 themes (e.g., "usability,performance,design")

Feedback: ${body.feedback_text}

Return only the JSON object, no other text.`;

				const aiResponse = await env.AI.run('@cf/meta/llama-3-8b-instruct', {
					prompt: prompt,
					max_tokens: 200,
					temperature: 0.3,
				});

				// Extract and parse AI response
				const aiText = aiResponse.response || '';
				
				// Try to extract JSON from the response (in case there's extra text)
				let analysis: { sentiment?: string; tags?: string };
				try {
					// Try to find JSON object in the response
					const jsonMatch = aiText.match(/\{[\s\S]*\}/);
					if (jsonMatch) {
						analysis = JSON.parse(jsonMatch[0]);
					} else {
						throw new Error('No JSON found in response');
					}
				} catch (parseError) {
					// Fallback: try to parse the entire response
					try {
						analysis = JSON.parse(aiText.trim());
					} catch {
						// If parsing fails, use defaults
						analysis = {
							sentiment: 'Neutral',
							tags: 'general'
						};
					}
				}

				// Ensure we have valid sentiment and tags
				const sentiment = ['Positive', 'Neutral', 'Negative'].includes(analysis.sentiment || '')
					? analysis.sentiment
					: 'Neutral';
				const tags = analysis.tags || 'general';

				// Insert into D1 database
				const insertResult = await env.DB.prepare(
					'INSERT INTO feedback (source, content, sentiment, tags) VALUES (?, ?, ?, ?) RETURNING *'
				)
					.bind(body.source, body.feedback_text, sentiment, tags)
					.first<{
						id: number;
						source: string;
						content: string;
						sentiment: string | null;
						tags: string | null;
						created_at: string;
					}>();

				if (!insertResult) {
					throw new Error('Failed to insert feedback into database');
				}

				// Return the saved record
				return new Response(
					JSON.stringify(insertResult),
					{
						status: 200,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			} catch (error) {
				return new Response(
					JSON.stringify({ 
						error: 'Internal server error', 
						message: error instanceof Error ? error.message : String(error)
					}),
					{
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
		}

		// Default response for other routes
		return new Response('Hello World!');
	},
} satisfies ExportedHandler<Env>;
