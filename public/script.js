document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO DE LA APLICACIÓN ---
    let transactions = [];
    let editMode = { on: false, transactionId: null };
    let pieChart, lineChart;

    // --- VERIFICACIÓN DE AUTENTICACIÓN ---
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login.html';
        return;
    }
    const apiHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };

    // --- Elementos del DOM ---
    const transactionForm = document.getElementById('transaction-form');
    const formTitle = document.getElementById('form-title');
    const submitBtn = document.getElementById('submit-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const transactionsTbody = document.getElementById('transactions-tbody');
    const totalIncomeEl = document.getElementById('total-income');
    const totalExpenseEl = document.getElementById('total-expense');
    const netBalanceEl = document.getElementById('net-balance');
    const notificationsContainer = document.getElementById('notifications-container');
    const logoutButton = document.getElementById('logout-btn');
    const lowBalanceThresholdInput = document.getElementById('low-balance-threshold');
    const balancesContent = document.getElementById('balances-content');
    const monthlySummaryContent = document.getElementById('monthly-summary-content');
    const exportPdfButton = document.getElementById('export-pdf');
    const exportCsvButton = document.getElementById('export-csv-btn'); // Botón CSV


    // --- LÓGICA PRINCIPAL ---
    const loadInitialData = async () => {
        try {
            const response = await fetch('/api/transactions', { headers: apiHeaders });
            if (!response.ok) throw new Error('Error al cargar datos.');
            const raw = await response.json();
            transactions = raw.map(tx => ({ ...tx, amount: parseFloat(tx.amount) }));
            renderApp();
        } catch (error) {
            handleError(error, 'No se pudieron cargar las transacciones iniciales.');
        }
    };

    const renderApp = () => {
        renderTransactions();
        renderSummary();
        renderCharts();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(transactionForm);
        const data = Object.fromEntries(formData.entries());
        data.amount = parseFloat(data.amount);

        submitBtn.disabled = true;
        submitBtn.textContent = editMode.on ? 'Actualizando...' : 'Guardando...';

        try {
            const url = editMode.on ? `/api/transactions/${editMode.transactionId}` : '/api/transactions';
            const method = editMode.on ? 'PUT' : 'POST';

            const response = await fetch(url, { method, headers: apiHeaders, body: JSON.stringify(data) });
            if (!response.ok) throw new Error('La petición al servidor falló.');
            
            const updatedOrNewTransaction = await response.json();
            updatedOrNewTransaction.amount = parseFloat(updatedOrNewTransaction.amount);

            if (editMode.on) {
                const index = transactions.findIndex(t => t.id === editMode.transactionId);
                transactions[index] = updatedOrNewTransaction;
            } else {
                transactions.unshift(updatedOrNewTransaction);
            }

            exitEditMode();
            renderApp();

        } catch (error) {
            handleError(error, `No se pudo ${editMode.on ? 'actualizar' : 'crear'} la transacción.`);
        } finally {
            submitBtn.disabled = false;
        }
    };

    const handleTableClick = (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        const action = target.dataset.action;
        const id = parseInt(target.dataset.id);

        if (action === 'delete') {
            deleteTransaction(id);
        } else if (action === 'edit') {
            enterEditMode(id);
        }
    };

    const enterEditMode = (id) => {
        const transaction = transactions.find(t => t.id === id);
        if (!transaction) return;

        editMode = { on: true, transactionId: id };

        // Llenar el formulario
        transactionForm.elements.type.value = transaction.type;
        transactionForm.elements.date.value = transaction.date.split('T')[0];
        transactionForm.elements.description.value = transaction.description;
        transactionForm.elements.amount.value = transaction.amount;
        transactionForm.elements.category.value = transaction.category;
        transactionForm.elements.account.value = transaction.account;

        // Actualizar UI del formulario
        formTitle.textContent = 'Editando Movimiento';
        submitBtn.textContent = 'Actualizar Movimiento';
        submitBtn.classList.replace('btn-success', 'btn-primary');
        cancelEditBtn.classList.remove('d-none');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const exitEditMode = () => {
        editMode = { on: false, transactionId: null };
        transactionForm.reset();
        formTitle.textContent = 'Registrar Movimiento';
        submitBtn.textContent = 'Registrar Movimiento';
        submitBtn.classList.replace('btn-primary', 'btn-success');
        cancelEditBtn.classList.add('d-none');
    };

    const deleteTransaction = async (id) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta transacción?')) return;
        try {
            const response = await fetch(`/api/transactions/${id}`, { method: 'DELETE', headers: apiHeaders });
            if (!response.ok) throw new Error('No se pudo eliminar en el servidor.');
            transactions = transactions.filter(tx => tx.id !== id);
            renderApp();
        } catch (error) {
            handleError(error, 'No se pudo eliminar la transacción.');
        }
    };

    // --- FUNCIONES DE RENDERIZADO ---
    const renderTransactions = () => {
        transactionsTbody.innerHTML = '';
        if (transactions.length === 0) {
            transactionsTbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay movimientos registrados.</td></tr>';
            return;
        }
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${new Date(tx.date).toLocaleDateString()}</td>
                <td>${tx.description}</td>
                <td class="${tx.type.toLowerCase()}">${formatCurrency(tx.amount)}</td>
                <td>${tx.type}</td>
                <td>${tx.category}</td>
                <td>${tx.account}</td>
                <td class="actions-cell">
                    <button class="btn btn-warning btn-sm me-1" data-action="edit" data-id="${tx.id}">Editar</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${tx.id}">Borrar</button>
                </td>
            `;
            transactionsTbody.appendChild(row);
        });
    };    
    const renderSummary = () => {
        const totalIncome = transactions.filter(t => t.type === 'Ingreso').reduce((sum, t) => sum + t.amount, 0);
        const totalExpense = transactions.filter(t => t.type === 'Gasto' || t.type === 'Inversion').reduce((sum, t) => sum + t.amount, 0);
        const netBalance = totalIncome - totalExpense;

        totalIncomeEl.textContent = formatCurrency(totalIncome);
        totalExpenseEl.textContent = formatCurrency(totalExpense);
        netBalanceEl.textContent = formatCurrency(netBalance);

        renderAccountBalances();
        renderMonthlySummary();
        checkAlerts(netBalance);
    };

    const renderAccountBalances = () => {
        if (transactions.length === 0) {
            balancesContent.innerHTML = '<p class="text-muted">No hay transacciones para calcular saldos.</p>';
            return;
        }
        const accounts = {};
        transactions.forEach(tx => {
            accounts[tx.account] = (accounts[tx.account] || 0) + (tx.type === 'Ingreso' ? tx.amount : -tx.amount);
        });
        balancesContent.innerHTML = Object.entries(accounts)
            .map(([account, balance]) => `<div class="account-balance"><strong>${account}:</strong> ${formatCurrency(balance)}</div>`)
            .join('');
    };

    const renderMonthlySummary = () => {
        if (transactions.length === 0) {
            monthlySummaryContent.innerHTML = '<p class="text-muted">No hay datos para el resumen mensual.</p>';
            return;
        }

        const monthlyData = {};
        transactions.forEach(tx => {
            const month = new Date(tx.date).toISOString().slice(0, 7);
            if (!monthlyData[month]) {
                monthlyData[month] = { income: 0, expense: 0 };
            }
            if (tx.type === 'Ingreso') {
                monthlyData[month].income += tx.amount;
            } else { 
                monthlyData[month].expense += tx.amount;
            }
        });

        const sortedMonths = Object.keys(monthlyData).sort().reverse();
        let summaryHtml = '';

        if (sortedMonths.length === 0) {
            monthlySummaryContent.innerHTML = '<p class="text-muted">No hay datos para el resumen mensual.</p>';
            return;
        }

        for (const month of sortedMonths) {
            const data = monthlyData[month];
            const totalFlow = data.income + data.expense;
            const incomePercent = totalFlow > 0 ? (data.income / totalFlow) * 100 : 0;
            const expensePercent = totalFlow > 0 ? (data.expense / totalFlow) * 100 : 0;
            
            const monthDate = new Date(month + '-02');
            const monthName = monthDate.toLocaleString('es-ES', { month: 'long', year: 'numeric' });

            summaryHtml += `
                <div class="monthly-summary-item mb-3">
                    <div class="d-flex justify-content-between">
                        <span class="fw-bold text-capitalize">${monthName}</span>
                        <span class="fw-bold ${data.income - data.expense >= 0 ? 'text-success' : 'text-danger'}">
                            Balance: ${formatCurrency(data.income - data.expense)}
                        </span>
                    </div>
                    <div class="progress mt-1" style="height: 22px; font-size: 0.8rem;">
                        <div class="progress-bar bg-success" role="progressbar" style="width: ${incomePercent}%" 
                             aria-valuenow="${data.income}" aria-valuemin="0" aria-valuemax="${totalFlow}">
                             ${formatCurrency(data.income)}
                        </div>
                        <div class="progress-bar bg-danger" role="progressbar" style="width: ${expensePercent}%" 
                             aria-valuenow="${data.expense}" aria-valuemin="0" aria-valuemax="${totalFlow}">
                             ${formatCurrency(data.expense)}
                        </div>
                    </div>
                </div>
            `;
        }
        monthlySummaryContent.innerHTML = summaryHtml;
    };

    const renderCharts = () => {
        const pieChartContainer = document.getElementById('pie-chart-container');
        const lineChartContainer = document.getElementById('line-chart-container');

        if (pieChart) pieChart.destroy();
        if (lineChart) lineChart.destroy();

        const expenseData = transactions
            .filter(t => t.type === 'Gasto' || t.type === 'Inversion')
            .reduce((acc, t) => {
                acc[t.category || 'Sin Categoría'] = (acc[t.category || 'Sin Categoría'] || 0) + t.amount;
                return acc;
            }, {});

        pieChartContainer.innerHTML = '';
        if (Object.keys(expenseData).length === 0) {
            pieChartContainer.innerHTML = '<div class="text-center text-muted p-4 h-100 d-flex align-items-center justify-content-center">No hay gastos para mostrar.</div>';
        } else {
            const canvas = document.createElement('canvas');
            pieChartContainer.appendChild(canvas);
            pieChart = new Chart(canvas, {
                type: 'pie',
                data: {
                    labels: Object.keys(expenseData),
                    datasets: [{ data: Object.values(expenseData), backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'] }]
                },
                options: { plugins: { title: { display: true, text: 'Gastos e Inversiones por Categoría' } } }
            });
        }

        lineChartContainer.innerHTML = '';
        if (transactions.length < 2) {
            lineChartContainer.innerHTML = '<div class="text-center text-muted p-4 h-100 d-flex align-items-center justify-content-center">Más datos para la línea de tiempo.</div>';
        } else {
            const canvas = document.createElement('canvas');
            lineChartContainer.appendChild(canvas);
             const sortedTx = [...transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
            let currentBalance = 0;
            const dailyBalances = sortedTx.reduce((acc, tx) => {
                currentBalance += (tx.type === 'Ingreso' ? tx.amount : -tx.amount);
                acc[tx.date.split('T')[0]] = currentBalance;
                return acc;
            }, {});

            lineChart = new Chart(canvas, {
                type: 'line',
                data: {
                    labels: Object.keys(dailyBalances).map(d => new Date(d).toLocaleDateString()),
                    datasets: [{ label: 'Balance Neto', data: Object.values(dailyBalances), borderColor: '#4a90e2', tension: 0.1 }]
                }
            });
        }
    };

    const handleExportCSV = async () => {
        try {
            const response = await fetch('/api/transactions/export/csv', { headers: apiHeaders });
            if (!response.ok) throw new Error('Falló la exportación a CSV.');

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = 'transacciones.csv';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
        } catch (error) {
            handleError(error, 'No se pudo generar el archivo CSV.');
        }
    };

    // --- UTILIDADES ---
    const formatCurrency = amount => `$${(parseFloat(amount) || 0).toFixed(2)}`;

    const checkAlerts = (netBalance) => {
        const threshold = parseFloat(lowBalanceThresholdInput.value);
        if (!isNaN(threshold) && netBalance < threshold) {
            showWarningNotification(`Alerta: Tu balance neto (${formatCurrency(netBalance)}) es menor que el umbral.`);
        }
    };

    const handleError = (error, userMessage) => {
        console.error(userMessage, error);
        showErrorNotification(userMessage);
    };

    const createNotification = (message, type) => {
        const wrapper = document.createElement('div');
        wrapper.className = `alert alert-${type} alert-dismissible fade show`;
        wrapper.setAttribute('role', 'alert');
        wrapper.innerHTML = `${message}<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>`;
        notificationsContainer.appendChild(wrapper);
    };
    const showWarningNotification = (message) => createNotification(message, 'warning');
    const showErrorNotification = (message) => createNotification(message, 'danger');

    // --- INICIALIZACIÓN ---
    transactionForm.addEventListener('submit', handleSubmit);
    transactionsTbody.addEventListener('click', handleTableClick);
    cancelEditBtn.addEventListener('click', exitEditMode);
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/login.html';
        });
    }
    if (exportPdfButton) {
        exportPdfButton.addEventListener('click', () => {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF();
            doc.text("Reporte de Transacciones", 14, 16);
            doc.autoTable({ 
                head: [["Fecha", "Descripción", "Monto", "Tipo", "Categoría", "Cuenta"]], 
                body: transactions.map(tx => [new Date(tx.date).toLocaleDateString(), tx.description, formatCurrency(tx.amount), tx.type, tx.category, tx.account]), 
                startY: 20 
            });
            doc.save('reporte-transacciones.pdf');
        });
    }
    if (exportCsvButton) {
        exportCsvButton.addEventListener('click', handleExportCSV);
    }

    loadInitialData();
});
