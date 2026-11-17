export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { postUrl } = req.body;
  const API_TOKEN = process.env.APIFY_TOKEN; // Pega a chave secreta do Vercel

  if (!API_TOKEN) {
    return res.status(500).json({ error: 'Token do Apify não configurado no servidor.' });
  }

  if (!postUrl) {
    return res.status(400).json({ error: 'URL da postagem não informada.' });
  }

  try {
    const actorId = 'apify~instagram-comment-scraper';

    // 1. Iniciar run no Apify
    const runRes = await fetch(`https://api.apify.com/v2/acts/${actorId}/runs?token=${API_TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        directUrls: [postUrl],
        resultsLimit: 5000
      })
    });

    if (!runRes.ok) throw new Error('Falha ao acionar a API do Apify.');

    const runJson = await runRes.json();
    const runId = runJson.data.id;
    const datasetId = runJson.data.defaultDatasetId;

    // 2. Polling inteligente no servidor
    let isFinished = false;
    let attempts = 0;

    while (!isFinished && attempts < 60) {
      attempts++;
      await new Promise(r => setTimeout(r, 3000));

      const statusRes = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${API_TOKEN}`);
      const statusJson = await statusRes.json();
      const status = statusJson.data.status;

      if (status === 'SUCCEEDED') {
        isFinished = true;
      } else if (status === 'FAILED' || status === 'ABORTED') {
        throw new Error('A execução do Apify falhou.');
      }
    }

    if (!isFinished) {
      throw new Error('Tempo limite excedido.');
    }

    // 3. Buscar dados do dataset
    const dataRes = await fetch(`https://api.apify.com/v2/datasets/${datasetId}/items?token=${API_TOKEN}`);
    const items = await dataRes.json();

    const formatted = items.map(item => ({
      user: '@' + (item.ownerUsername || item.username || 'usuario'),
      comment: item.text || item.comment || ''
    }));

    return res.status(200).json({ comentarios: formatted });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
