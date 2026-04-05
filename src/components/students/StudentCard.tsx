import { Student } from '@/lib/types';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { getStatusLabel } from '@/lib/utils';

interface StudentCardProps {
  student: Student;
}

export function StudentCard({ student }: StudentCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <h3 className="text-xl font-bold text-gray-900">
              {student.first_name} {student.last_name}
            </h3>
            <p className="text-sm text-gray-600 mt-1">{student.shiur}</p>
          </div>
          <Badge
            variant={
              student.status === 'active'
                ? 'success'
                : student.status === 'inactive'
                  ? 'warning'
                  : 'gray'
            }
          >
            {getStatusLabel(student.status)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-600">תעודת זהות</p>
            <p className="font-semibold">{student.id_number}</p>
          </div>
          <div>
            <p className="text-gray-600">טלפון</p>
            <p className="font-semibold">{student.phone || '-'}</p>
          </div>
          <div>
            <p className="text-gray-600">דוא״ל</p>
            <p className="font-semibold text-xs break-all">{student.email || '-'}</p>
          </div>
          <div>
            <p className="text-gray-600">עיר</p>
            <p className="font-semibold">{student.city || '-'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
