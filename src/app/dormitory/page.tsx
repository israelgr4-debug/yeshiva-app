'use client';

import { useState, useEffect } from 'react';
import { Header } from '@/components/layout/Header';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Modal } from '@/components/ui/Modal';
import { useSupabase } from '@/hooks/useSupabase';

interface Room {
  id: string;
  room_number: string;
  building: string;
  wing: string;
  floor: number;
  capacity: number;
  current_occupants: number;
  status: string;
}

interface RoomAssignment {
  id: string;
  room_id: string;
  student_id: string;
}

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

export default function DormitoryPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [assignments, setAssignments] = useState<RoomAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [_loading, setLoading] = useState(true);

  const { fetchData } = useSupabase();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const roomsData = await fetchData<Room>('rooms');
      const assignmentsData = await fetchData<RoomAssignment>('room_assignments');
      const studentsData = await fetchData<Student>('students');

      setRooms(roomsData);
      setAssignments(assignmentsData);
      setStudents(studentsData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  }

  const getOccupantNames = (roomId: string): string => {
    const roomAssignments = assignments.filter((a) => a.room_id === roomId);
    if (roomAssignments.length === 0) return 'פנוי';

    return roomAssignments
      .map((a) => {
        const student = students.find((s) => s.id === a.student_id);
        return student ? `${student.first_name} ${student.last_name}` : '-';
      })
      .join(', ');
  };

  const handleRoomClick = (room: Room) => {
    setSelectedRoom(room);
    setShowModal(true);
  };

  const roomsByBuilding = rooms.reduce(
    (acc, room) => {
      if (!acc[room.building]) {
        acc[room.building] = {};
      }
      if (!acc[room.building][room.wing]) {
        acc[room.building][room.wing] = {};
      }
      if (!acc[room.building][room.wing][room.floor]) {
        acc[room.building][room.wing][room.floor] = [];
      }
      acc[room.building][room.wing][room.floor].push(room);
      return acc;
    },
    {} as Record<string, Record<string, Record<number, Room[]>>>
  );

  return (
    <>
      <Header title="פנימיה" subtitle="ניהול חדרים וחלוקה" />

      <div className="p-8">
        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <Card className="bg-blue-50">
            <CardContent>
              <p className="text-sm text-gray-600 mt-4">סה״כ חדרים</p>
              <p className="text-3xl font-bold mt-2">{rooms.length}</p>
            </CardContent>
          </Card>
          <Card className="bg-green-50">
            <CardContent>
              <p className="text-sm text-gray-600 mt-4">חדרים תפוסים</p>
              <p className="text-3xl font-bold mt-2">
                {rooms.filter((r) => r.status === 'occupied').length}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-purple-50">
            <CardContent>
              <p className="text-sm text-gray-600 mt-4">אחוז תפוסה</p>
              <p className="text-3xl font-bold mt-2">
                {rooms.length > 0
                  ? Math.round(
                      (rooms.filter((r) => r.status === 'occupied').length / rooms.length) * 100
                    )
                  : 0}
                %
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Rooms by Building */}
        {Object.entries(roomsByBuilding).map(([building, wings]) => (
          <Card key={building} className="mb-6">
            <CardHeader>
              <h2 className="text-2xl font-bold">בנין {building}</h2>
            </CardHeader>
            <CardContent>
              {Object.entries(wings).map(([wing, floors]) => (
                <div key={wing} className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-700 mb-4">כנף {wing}</h3>
                  {Object.entries(floors)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([floor, roomsInFloor]) => (
                      <div key={floor} className="mb-4">
                        <p className="text-sm text-gray-600 mb-2">קומה {floor}</p>
                        <div className="grid grid-cols-6 gap-2">
                          {roomsInFloor.map((room) => (
                            <button
                              key={room.id}
                              onClick={() => handleRoomClick(room)}
                              className={`p-3 rounded-lg border-2 transition-all hover:shadow-md ${
                                room.status === 'occupied'
                                  ? 'bg-green-100 border-green-300'
                                  : room.status === 'available'
                                    ? 'bg-blue-100 border-blue-300'
                                    : 'bg-gray-100 border-gray-300'
                              }`}
                            >
                              <p className="font-semibold text-sm">{room.room_number}</p>
                              <p className="text-xs text-gray-600 mt-1">
                                {room.current_occupants}/{room.capacity}
                              </p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}

        {/* Room Details Modal */}
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="פרטי חדר">
          {selectedRoom && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600">מספר חדר</p>
                <p className="text-lg font-semibold">{selectedRoom.room_number}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">בנין / כנף / קומה</p>
                <p className="text-lg font-semibold">
                  {selectedRoom.building} / {selectedRoom.wing} / {selectedRoom.floor}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">קיבולת</p>
                <p className="text-lg font-semibold">
                  {selectedRoom.current_occupants} / {selectedRoom.capacity}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">סטטוס</p>
                <Badge
                  variant={
                    selectedRoom.status === 'occupied'
                      ? 'success'
                      : selectedRoom.status === 'available'
                        ? 'primary'
                        : 'gray'
                  }
                  className="mt-1"
                >
                  {selectedRoom.status === 'occupied'
                    ? 'תפוס'
                    : selectedRoom.status === 'available'
                      ? 'פנוי'
                      : 'תחזוקה'}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-gray-600">תלמידים</p>
                <p className="text-lg font-semibold">{getOccupantNames(selectedRoom.id)}</p>
              </div>
            </div>
          )}
        </Modal>
      </div>
    </>
  );
}
