"use client";

import React, { useState } from 'react';

const ScoreBadge = ({ score }: { score: number }) => {
  const percentage = score / 32;
  let color = "bg-green-100 text-green-800";
  let text = "Mild";

  if (percentage > 0.4) { color = "bg-yellow-100 text-yellow-800"; text = "Moderate"; }
  if (percentage > 0.7) { color = "bg-red-100 text-red-800"; text = "Severe"; }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${color}`}>
      {text} ({score.toFixed(2)})
    </span>
  );
};

export default function PWATScreen() {
  const [score, setScore] = useState<number | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setScore(null);

    try {
      // 1. Envia a imagem para a rota de upload
      const formData = new FormData();
      formData.append('file', file); // A rota /api/upload espera a chave 'file'

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Falha no upload da imagem");

      const uploadData = await uploadRes.json();
      if (!uploadData.success) throw new Error(uploadData.error || "Erro desconhecido no upload");

      // 2. Aciona o modelo via child_process usando o caminho salvo
      const predictRes = await fetch('/api/pwat-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: uploadData.path }),
      });

      if (!predictRes.ok) throw new Error("Falha na execução do modelo Deepskin");

      const predictData = await predictRes.json();

      // 3. Atualiza a interface com o resultado
      setScore(predictData.pwatScore);

    } catch (error) {
      console.error(error);
      alert("Erro durante o processamento da imagem. Verifique a conexão com o backend.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-6 max-w-md mx-auto bg-white rounded-xl shadow-md border space-y-6 mt-10">
      <h2 className="text-xl font-bold text-gray-800">Análise de Ferida (PWAT)</h2>

      <div className="flex flex-col space-y-2">
        <label className="text-sm font-medium text-gray-600">
          Faça upload da imagem para análise:
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          disabled={isProcessing}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
        />
      </div>

      {isProcessing && (
        <p className="text-sm text-blue-600 font-medium animate-pulse">
          Executando modelo Deepskin...
        </p>
      )}

      {score !== null && !isProcessing && (
        <div className="pt-4 border-t flex items-center justify-between">
          <span className="font-semibold text-gray-700">Resultado PWAT:</span>
          <ScoreBadge score={score} />
        </div>
      )}
    </div>
  );
}
