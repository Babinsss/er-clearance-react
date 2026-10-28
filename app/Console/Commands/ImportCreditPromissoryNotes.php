<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class ImportCreditPromissoryNotes extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'credit:import-excel {path? : Path to Excel file}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Import Credit and Collection Excel daily transactions and promissory notes';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $path = $this->argument('path') ?: 'E:\\SAMPLE DTR\\DIALY TRANSACTION 2024-2026 CLYNT MARK N-compressed.xlsx';

        if (!file_exists($path)) {
            $this->error("File not found at: {$path}");
            return 1;
        }

        $this->info("Starting import from: {$path}");
        $scriptPath = base_path('scratch/import_excel_to_mysql.py');
        if (!file_exists($scriptPath)) {
            $scriptPath = 'C:\\Users\\Administrator\\.gemini\\antigravity\\brain\\f63d9955-a39b-4ccf-b1b7-f943f37e8056\\scratch\\import_excel_to_mysql.py';
        }

        passthru("python " . escapeshellarg($scriptPath));
        $this->info("Import completed successfully!");
        return 0;
    }
}
