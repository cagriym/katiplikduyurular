export interface Student {
  id: string;
  name: string;
  studentNumber: string;
  email?: string;
  phone?: string;
  class?: string;
}

export interface Course {
  id: string;
  name: string;
  code: string;
  instructor: string;
  schedule: {
    day: string;
    startTime: string;
    endTime: string;
  };
  classroom?: string;
}

export interface AttendanceRecord {
  id: string;
  studentId: string;
  courseId: string;
  date: string;
  status: 'present' | 'absent' | 'late' | 'excused';
  notes?: string;
  recordedAt: string;
  recordedBy: string;
}

export interface AttendanceSession {
  id: string;
  courseId: string;
  date: string;
  startTime: string;
  endTime: string;
  totalStudents: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  isActive: boolean;
}

export type AttendanceStatus = 'present' | 'absent' | 'late' | 'excused';

export interface AttendanceStats {
  totalSessions: number;
  totalAttendance: number;
  attendanceRate: number;
  statusBreakdown: {
    present: number;
    absent: number;
    late: number;
    excused: number;
  };
}
