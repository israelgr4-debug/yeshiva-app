'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/Table';
import { useSupabase } from '@/hooks/useSupabase';
import { formatDate, formatCurrency, getStatusLabel } from '@/lib/utils';
import { DonationsSummary } from '@/components/finances/DonationsSummary';

interface Donation {
  id: string;
  student_id: string;
  amount: number;
  status: string;
  donation_date: string;
  notes: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

export default function FinancesPage() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [_loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newDonation, setNewDonation] = useState({
    student_id: '',
    amount: '',
    status: 'committed',
    donation_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const { fetchData, insertData } = useSupabase();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const donationsData = await fetchData<Donation>('donations');
      const studentsData = await fetchData<Student>('students');
      setDonations(donationsData);
      setStudents(studentsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddDonation() {
    if (!newDonation.student_id || !newDonation.amount) {
      alert('אנא מלא את כל השדות');
      return;
    }

    try {
      await insertData('donations', {
        student_id: newDonation.student_id,
        amount: parseFloat(newDonation.amount),
        status: newDonation.status,
        donation_date: newDonation.donation_date,
        currency: 'ILS',
        notes: newDonation.notes,
      });

      setNewDonation({
        student_id: '',
        amount: '',
        status: 'committed',
        donation_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
      setShowForm(false);
      await loadData();
    } catch (error) {
      console.error('Failed to add donation:', error);
    }
  }

  const stats = {
    committed: donations
      .filter((d) => d.status === 'committed')
      .reduce((sum, d) => sum + d.amount, 0),
    collected: donations
      .filter((d) => d.status === 'collected')
      .reduce((sum, d) => sum + d.amount, 0),
    pending: donations
      .filter((d) => d.status === 'pending')
      .reduce((sum, d) => sum + d.amount, 0),
  };

  const getStudentName = (studentId: string) => {
    const student = students.find((s) => s.id === studentId);
    return student ? `${student.first_name} ${student.last_name}` : '-';
  };

  return (
    <>
      <Header title="כספים" subtitle="ניהול תרומות והכנסות" />

      <div className="p-8">
        {/* Summary */}
        <DonationsSummary
          totalCommitted={stats.committed}
          totalCollected={stats.collected}
          totalPending={stats.pending}
        />

        {/* Add Donation Form */}
        {showForm ? (
          <Card className="mb-8">
            <CardHeader>
              <h3 className="text-xl font-bold">רשום תרומה חדשה</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Select
                  label="תלמיד"
                  value={newDonation.student_id}
                  onChange={(e) =>
                    setNewDonation((p) => ({ ...p, student_id: e.target.value }))
                  }
                  options={students.map((s) => ({
                    value: s.id,
                    label: `${s.first_name} ${s.last_name}`,
                  }))}
                />
                <Input
                  label="סכום"
                  type="number"
                  value={newDonation.amount}
                  onChange={(e) => setNewDonation((p) => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <Select
                  label="סטטוס"
                  value={newDonation.status}
                  onChange={(e) => setNewDonation((p) => ({ ...p, status: e.target.value }))}
                  options={[
                    { value: 'committed', label: 'התחייבות' },
                    { value: 'collected', label: 'גבוה' },
                    { value: 'pending', label: 'ממתין' },
                  ]}
                />
                <Input
                  label="תאריך"
                  type="date"
                  value={newDonation.donation_date}
                  onChange={(e) =>
                    setNewDonation((p) => ({ ...p, donation_date: e.target.value }))
                  }
                />
              </div>
              <Input
                label="הערות"
                value={newDonation.notes}
                onChange={(e) => setNewDonation((p) => ({ ...p, notes: e.target.value }))}
              />
              <div className="flex gap-2 mt-6">
                <Button onClick={handleAddDonation}>שמור</Button>
                <Button variant="secondary" onClick={() => setShowForm(false)}>
                  ביטול
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="mb-6">
            <Button onClick={() => setShowForm(true)}>רשום תרומה חדשה</Button>
          </div>
        )}

        {/* Donations Table */}
        <Card>
          <CardHeader>
            <h3 className="text-xl font-bold">התרומות האחרונות</h3>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableCell isHeader>תלמיד</TableCell>
                  <TableCell isHeader>סכום</TableCell>
                  <TableCell isHeader>סטטוס</TableCell>
                  <TableCell isHeader>תאריך</TableCell>
                  <TableCell isHeader>הערות</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {donations.length > 0 ? (
                  donations.map((donation) => (
                    <TableRow key={donation.id}>
                      <TableCell>{getStudentName(donation.student_id)}</TableCell>
                      <TableCell>{formatCurrency(donation.amount)}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            donation.status === 'collected'
                              ? 'success'
                              : donation.status === 'pending'
                                ? 'warning'
                                : 'primary'
                          }
                        >
                          {getStatusLabel(donation.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(donation.donation_date)}</TableCell>
                      <TableCell>{donation.notes || '-'}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-gray-500">
                      אין תרומות רשומות
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
