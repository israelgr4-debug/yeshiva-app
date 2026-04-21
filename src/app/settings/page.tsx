'use client';

import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useState } from 'react';
import { NedarimPlusSettings } from '@/components/settings/NedarimPlusSettings';

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    institutionName: 'ישיבת מיר מודיעין עילית',
    institutionLocation: 'מודיעין עילית',
    adminName: 'מנהל',
    adminEmail: 'admin@yeshiva.org',
    phone: '09-123-4567',
  });

  const [saved, setSaved] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = () => {
    // In a real app, this would save to the backend
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <>
      <Header title="הגדרות" subtitle="תצורה של המערכת" />

      <div className="p-8 max-w-2xl">
        {/* General Settings */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-2xl font-bold">הגדרות כלליות</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                label="שם המוסד"
                name="institutionName"
                value={settings.institutionName}
                onChange={handleChange}
              />
              <Input
                label="מיקום"
                name="institutionLocation"
                value={settings.institutionLocation}
                onChange={handleChange}
              />
              <Input
                label="טלפון"
                name="phone"
                type="tel"
                value={settings.phone}
                onChange={handleChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* Admin Settings */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-2xl font-bold">הגדרות ניהול</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                label="שם המנהל"
                name="adminName"
                value={settings.adminName}
                onChange={handleChange}
              />
              <Input
                label="דוא״ל המנהל"
                name="adminEmail"
                type="email"
                value={settings.adminEmail}
                onChange={handleChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* Nedarim Plus Integration */}
        <div className="mb-6">
          <NedarimPlusSettings />
        </div>

        {/* System Settings */}
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-2xl font-bold">הגדרות מערכת</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold">גיבוי אוטומטי</p>
                  <p className="text-sm text-gray-600">גבה את הנתונים כל יום בשעה 2:00 בלילה</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold">הודעות דוא״ל</p>
                  <p className="text-sm text-gray-600">שלח הודעות דוא״ל על אירועים חשובים</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="w-4 h-4" />
                </label>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-semibold">מצב כהה</p>
                  <p className="text-sm text-gray-600">השתמש בנושא כהה בממשק המשתמש</p>
                </div>
                <label className="flex items-center cursor-pointer">
                  <input type="checkbox" className="w-4 h-4" />
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <h2 className="text-2xl font-bold text-red-900">אזור סכנה</h2>
          </CardHeader>
          <CardContent>
            <p className="text-red-800 mb-4">הפעולות הבאות אינן ניתנות לביטול:</p>
            <div className="space-y-2">
              <Button variant="danger" className="w-full">
                מחק את כל הנתונים
              </Button>
              <Button variant="danger" className="w-full">
                אפס את המערכת
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="mt-8 flex gap-4">
          <Button onClick={handleSave} size="lg">
            שמור הגדרות
          </Button>
          {saved && (
            <div className="flex items-center text-green-600">
              <span>ההגדרות נשמרו בהצלחה</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
