import { supabase } from '@/lib/supabase';

// Generate Excel using SheetJS (you'll need to install: npm install xlsx)
// For now, we'll create a simpler CSV export that opens in Excel

export async function exportTuitionToExcel(month: string): Promise<Blob | null> {
  try {
    // Fetch all pending/scheduled payments for the specified month
    const { data: payments, error } = await supabase
      .from('tuition_payments')
      .select('*')
      .eq('payment_month', month)
      .in('status', ['scheduled', 'partial']) // Only export non-collected payments
      .order('family_id');

    if (error) throw error;

    if (!payments || payments.length === 0) {
      alert('אין תשלומים להוצאה לחודש זה');
      return null;
    }

    // Build CSV content
    let csvContent =
      'שם משפחה,שם האב,תעודת אב,בנק,סניף,חשבון,סכום כללי,תלמידים,סכומים,שיטת תשלום,תאריך מתוזמן\n';

    for (const payment of payments) {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('id', payment.family_id)
        .single();

      if (!familyData) continue;

      // Get students for breakdown
      const { data: studentsData } = await supabase
        .from('students')
        .select('id, first_name, last_name')
        .in('id', payment.student_ids);

      const studentNames =
        studentsData
          ?.map((s) => `${s.first_name} ${s.last_name}`)
          .join(' | ') || '';

      const amounts = payment.student_ids
        .map((id: string) => {
          const amount = payment.amount_breakdown[id] || 0;
          return `${amount}`;
        })
        .join(' | ');

      // Escape CSV values
      const escapeCsv = (val: string | number | null | undefined) => {
        if (!val) return '';
        const str = val.toString();
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const row = [
        escapeCsv(familyData.family_name),
        escapeCsv(familyData.father_name),
        escapeCsv(familyData.father_id_number),
        escapeCsv(familyData.bank_name),
        escapeCsv(familyData.bank_branch),
        escapeCsv(familyData.bank_account),
        payment.total_amount,
        escapeCsv(studentNames),
        escapeCsv(amounts),
        getPaymentMethodLabel(payment.payment_method),
        payment.scheduled_date,
      ];

      csvContent += row.join(',') + '\n';
    }

    // Create blob and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    return blob;
  } catch (error) {
    console.error('Error exporting tuition data:', error);
    alert('שגיאה בהוצאת הנתונים');
    return null;
  }
}

// Helper to download blob as file
export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function getPaymentMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    standing_order: 'הוראת קבע',
    check: 'צ"ק',
    credit: 'אשראי',
    office: 'במשרד',
  };
  return labels[method] || method;
}

// Generate text file for bank transfer (simplified MAOF format - can be extended)
export async function generateBankTransferFile(month: string): Promise<string> {
  try {
    const { data: payments } = await supabase
      .from('tuition_payments')
      .select('*')
      .eq('payment_month', month)
      .eq('payment_method', 'standing_order')
      .in('status', ['scheduled', 'partial']);

    if (!payments || payments.length === 0) {
      return '';
    }

    let content = '';

    for (const payment of payments) {
      const { data: familyData } = await supabase
        .from('families')
        .select('*')
        .eq('id', payment.family_id)
        .single();

      if (familyData && familyData.bank_account && familyData.bank_branch) {
        // Format: simplified version (in real use, follow bank specific format)
        content += `${familyData.bank_branch.padEnd(3)}-${familyData.bank_account.padStart(8, '0')} ${payment.total_amount.toString().padStart(10)}\n`;
      }
    }

    return content;
  } catch (error) {
    console.error('Error generating bank transfer file:', error);
    return '';
  }
}
