const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';

async function request(path, options) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json();
}

export function fetchMessages() {
  return request('/messages');
}

export function sendMessage(message) {
  return request('/messages', {
    method: 'POST',
    body: JSON.stringify(message),
  });
}
