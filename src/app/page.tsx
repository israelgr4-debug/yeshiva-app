'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useSupabase } from '@/hooks/useSupabase';
import { DashboardStats } from '@/lib/types';

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    total_students: 0,
    active_students: 0,
    total_donations_committed: 0,
    total_donations_collected: 0,
    rooms_occupied: 0,
    total_rooms: 0,
    staff_count: 0,
  });
  const [_loading, setLoading] = useState(true);
  const { fetchData } = useSupabase();

  useEffect(() => {
    async function loadStats() {
      try {
        const students = await fetchData<any>('students');
        const donations = await fetchData<any>('donations');
        const rooms = await fetchData<any>('rooms');
        const staff = await fetchData<any>('staff');

        const activeStudents = students.filter((s: any) => s.status === 'active').length;
        const committedDonations = donations
          .filter((d: any) => d.status === 'committed')
          .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        const collectedDonations = donations
          .filter((d: any) => d.status === 'collected')
          .reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
        const occupiedRooms = rooms.filter((r: any) => r.status === 'occupied').length;

        setStats({
          total_students: students.length,
          active_students: activeStudents,
          total_donations_committed: committedDonations,
          total_donations_collected: collectedDonations,
          rooms_occupied: occupiedRooms,
          total_rooms: rooms.length,
          staff_count: staff.length,
        });
      } catch (error) {
        console.error('Failed to load stats:', error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
  }, [fetchData]);

  const statCards = [
    {
      title: 'סה״כ תלמידים',
      value: stats.total_students,
      subtitle: `${stats.active_students} פעילים`,
      color: 'bg-blue-50',
    },
    {
      title: 'סה״כ התחייבויות',
      value: `₪${(stats.total_donations_committed / 1000).toFixed(1)}K`,
      color: 'bg-green-50',
    },
    {
      title: 'סה״כ גבוי',
      value: `₪${(stats.total_donations_collected / 1000).toFixed(1)}K`,
      color: 'bg-emerald-50',
    },
    {
      title: 'חדרים תפוסים',
      value: `${stats.rooms_occupied}/${stats.total_rooms}`,
      color: 'bg-purple-50',
    },
  ];

  return (
    <>
      <Header title="לוח בקרה" subtitle="ישיבת מיר מודיעין עילית" />

      <div className="p-8">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          {statCards.map((stat, index) => (
            <Card key={index} className={stat.color}>
              <CardContent>
                <p className="text-sm text-gray-600 mt-4">{stat.title}</p>
                <p className="text-3xl font-bold mt-2">{stat.value}</p>
                {stat.subtitle && (
                  <p className="text-xs text-gray-500 mt-2">{stat.subtitle}</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-2xl font-bold text-gray-900">פעולות מהירות</h2>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-4">
              <Link href="/students">
                <Button className="w-full">הוסף תלמיד</Button>
              </Link>
              <Link href="/finances">
                <Button className="w-full" variant="secondary">
                  רשום תרומה
                </Button>
              </Link>
              <Link href="/dormitory">
                <Button className="w-full" variant="secondary">
                  ניהול פנימיה
                </Button>
              </Link>
              <Link href="/settings">
                <Button className="w-full" variant="ghost">
                  הגדרות
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Placeholder */}
        <Card>
          <CardHeader>
            <h2 className="text-2xl font-bold text-gray-900">פעילות אחרונה</h2>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <p className="text-gray-500">אין פעילות להצגה</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
