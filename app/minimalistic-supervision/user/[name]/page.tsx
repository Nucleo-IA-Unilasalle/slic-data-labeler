'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { toast } from 'sonner';

interface ChartData {
  name: string;
  value: number;
}

interface UserStats {
  username: string;
  totalLabels: number;
  skippedCount: number;
  validCount: number;
  tissueStats: ChartData[];
  exudateStats: ChartData[];
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const TISSUE_COLORS: Record<string, string> = {
  'granulação': '#ef4444', // Red
  'esfacelo': '#eab308',    // Yellow
  'necrotic': '#1f2937',    // Dark/Black
  'epitelial': '#ec4899',   // Pink
  'Unspecified': '#9ca3af'  // Gray
};

const EXUDATE_COLORS: Record<string, string> = {
  'none': '#22c55e',      // Green
  'low': '#3b82f6',       // Blue
  'medium': '#eab308',    // Yellow
  'high': '#ef4444',      // Red
  'Unspecified': '#9ca3af' // Gray
};

export default function UserProfilePage() {
  const params = useParams();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Handle the possibility of the folder being named [name].tsx or [name]
  // We assume the param is 'name' based on [name].tsx
  const usernameParam = params?.name as string;
  // In case the folder name [name].tsx results in a param named 'name' but strictly creates a route like /user/alex.tsx
  // We'll just use whatever string we get. If the URL is /user/alex, params.name is alex.

  useEffect(() => {
    if (usernameParam) {
      fetchUserStats(decodeURIComponent(usernameParam));
    }
  }, [usernameParam]);

  const fetchUserStats = async (username: string) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/supervision/user-stats?username=${encodeURIComponent(username)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to fetch user stats');
      }
      
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching user stats:', error);
      toast.error('Falha ao carregar estatísticas do usuário');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Carregando estatísticas...</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Usuário não encontrado ou erro ao carregar dados.</p>
        <Link href="/minimalistic-supervision">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-background">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link href="/minimalistic-supervision">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <h1 className="text-3xl font-bold tracking-tight">Perfil do Usuário</h1>
            </div>
            <p className="text-muted-foreground ml-10">
              Estatísticas de classificação para <span className="font-semibold text-foreground">{stats.username}</span>
            </p>
          </div>
          <Badge variant="outline" className="text-lg px-4 py-1">
            Total: {stats.totalLabels}
          </Badge>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Classificado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalLabels}</div>
              <p className="text-xs text-muted-foreground">
                Imagens processadas
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Classificações Válidas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.validCount}</div>
              <p className="text-xs text-muted-foreground">
                Com tecido e exsudato definidos
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Puladas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.skippedCount}</div>
              <p className="text-xs text-muted-foreground">
                Imagens puladas
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* Tissue Type Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Distribuição por Tipo de Tecido</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.tissueStats}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {stats.tissueStats.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={TISSUE_COLORS[entry.name] || COLORS[index % COLORS.length]} 
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Exudate Level Chart */}
          <Card className="col-span-1">
            <CardHeader>
              <CardTitle>Distribuição por Nível de Exsudato</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.exudateStats}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" name="Quantidade">
                      {stats.exudateStats.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={EXUDATE_COLORS[entry.name] || COLORS[index % COLORS.length]} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

