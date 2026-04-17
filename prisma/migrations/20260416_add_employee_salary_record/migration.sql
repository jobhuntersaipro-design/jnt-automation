-- CreateTable
CREATE TABLE "EmployeeSalaryRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "basicPay" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workingHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyWage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "kpiAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "petrolAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAllowance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSalary" DOUBLE PRECISION NOT NULL,
    "epfEmployee" DOUBLE PRECISION NOT NULL,
    "socsoEmployee" DOUBLE PRECISION NOT NULL,
    "eisEmployee" DOUBLE PRECISION NOT NULL,
    "pcb" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "epfEmployer" DOUBLE PRECISION NOT NULL,
    "socsoEmployer" DOUBLE PRECISION NOT NULL,
    "eisEmployer" DOUBLE PRECISION NOT NULL,
    "penalty" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "advance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netSalary" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSalaryRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeSalaryRecord_employeeId_idx" ON "EmployeeSalaryRecord"("employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSalaryRecord_month_year_idx" ON "EmployeeSalaryRecord"("month", "year");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSalaryRecord_employeeId_month_year_key" ON "EmployeeSalaryRecord"("employeeId", "month", "year");

-- AddForeignKey
ALTER TABLE "EmployeeSalaryRecord" ADD CONSTRAINT "EmployeeSalaryRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
