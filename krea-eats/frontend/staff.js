const staffState = {
    user: null,
    orders: [],
    menuItems: []
};

const $ = (selector) => document.querySelector(selector);

async function api(url, options = {}) {
    const response = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        },
        ...options
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
    }

    return data;
}

function showToast(message) {
    const toast = $("#toast");

    toast.textContent = message;
    toast.classList.add("visible");

    setTimeout(() => {
        toast.classList.remove("visible");
    }, 3000);
}

function showStaffApp() {
    $("#staff-login-screen").classList.add("hidden");
    $("#staff-app").classList.remove("hidden");

    $("#staff-name").textContent = staffState.user.name;

    $("#staff-outlet").textContent =
        staffState.user.role === "admin"
            ? "All outlets"
            : staffState.user.outlet_name;

    loadStaffOrders();
}

function showStaffLogin() {
    $("#staff-login-screen").classList.remove("hidden");
    $("#staff-app").classList.add("hidden");
}

async function checkStaffSession() {
    /*
     * The backend does not yet expose a separate staff session
     * endpoint, so we begin at the staff login screen.
     */
    showStaffLogin();
}

async function staffLogin(event) {
    event.preventDefault();

    const email = $("#staff-email").value.trim();

    try {
        const data = await api("/api/staff/login", {
            method: "POST",
            body: JSON.stringify({
                email
            })
        });

        staffState.user = data.staff_user;

        showToast("Staff login successful");
        showStaffApp();
    } catch (error) {
        showToast(error.message);
    }
}

async function staffLogout() {
    await api("/api/staff/logout", {
        method: "POST"
    });

    staffState.user = null;
    staffState.orders = [];
    staffState.menuItems = [];

    showStaffLogin();
}

async function loadStaffOrders() {
    try {
        const data = await api("/api/staff/orders");

        staffState.orders = data.orders;

        renderStaffOrders();
    } catch (error) {
        showToast(error.message);
    }
}

function renderStaffOrders() {
    const container = $("#staff-orders-container");

    if (staffState.orders.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div>📦</div>
                <h2>No incoming orders</h2>
                <p>New student orders will appear here.</p>
            </div>
        `;

        return;
    }

    container.innerHTML = staffState.orders.map((order) => {
        const isNew = order.order_status === "Received";

        const statusOptions = [
            "Received",
            "Accepted",
            "Preparing",
            "Ready",
            "Completed",
            "Cancelled"
        ].map((status) => `
            <option
                value="${status}"
                ${order.order_status === status ? "selected" : ""}
            >
                ${status}
            </option>
        `).join("");

        const itemRows = order.items.map((item) => `
            <div class="staff-order-item">
                <span>
                    ${item.quantity} × ${item.item_name}
                </span>

                <span>
                    ₹${(
                        item.item_price * item.quantity
                    ).toFixed(2)}
                </span>
            </div>
        `).join("");

        return `
            <article
                class="staff-order-card ${isNew ? "is-new" : ""}"
            >
                <div class="staff-order-header">
                    <div>
                        <h3>Order #${order.id}</h3>
                        <small>${order.created_at}</small>
                    </div>

                    <span class="status">
                        ${order.order_status}
                    </span>
                </div>

                <div class="staff-order-details">
                    <p>
                        <strong>Pickup location:</strong>
                        ${order.pickup_location_name || "Not specified"}
                    </p>

                    <p>
                        <strong>Pickup time:</strong>
                        ${order.pickup_time || "Not specified"}
                    </p>

                    <p>
                        <strong>Estimated time:</strong>
                        ${order.estimated_time} minutes
                    </p>

                    <p>
                        <strong>Student:</strong>
                        ${order.user_email}
                    </p>

                    ${
                        order.order_notes
                            ? `
                                <p>
                                    <strong>Notes:</strong>
                                    ${order.order_notes}
                                </p>
                            `
                            : ""
                    }

                    ${
                        order.allergy_information
                            ? `
                                <p class="warning-note">
                                    <strong>
                                        Allergy information:
                                    </strong>
                                    ${order.allergy_information}
                                </p>
                            `
                            : ""
                    }
                </div>

                <div class="staff-order-items">
                    ${itemRows}
                </div>

                <p>
                    <strong>Total:</strong>
                    ₹${Number(order.total).toFixed(2)}
                </p>

                <div class="staff-order-actions">
                    <label>
                        Order status
                    </label>

                    <select
                        class="order-status-select"
                        data-order-id="${order.id}"
                    >
                        ${statusOptions}
                    </select>

                    <button
                        class="staff-action-button update-status-button"
                        data-order-id="${order.id}"
                    >
                        Update status
                    </button>

                    <label>
                        Estimated waiting time in minutes
                    </label>

                    <input
                        class="estimated-time-input"
                        type="number"
                        min="0"
                        max="240"
                        value="${order.estimated_time}"
                        data-order-id="${order.id}"
                    >

                    <button
                        class="staff-action-button update-time-button"
                        data-order-id="${order.id}"
                    >
                        Update waiting time
                    </button>
                </div>
            </article>
        `;
    }).join("");

    attachOrderActionListeners();
}

function attachOrderActionListeners() {
    document.querySelectorAll(
        ".update-status-button"
    ).forEach((button) => {
        button.addEventListener("click", async () => {
            const orderId = Number(button.dataset.orderId);

            const select = document.querySelector(
                `.order-status-select[data-order-id="${orderId}"]`
            );

            await updateOrderStatus(orderId, select.value);
        });
    });

    document.querySelectorAll(
        ".update-time-button"
    ).forEach((button) => {
        button.addEventListener("click", async () => {
            const orderId = Number(button.dataset.orderId);

            const input = document.querySelector(
                `.estimated-time-input[data-order-id="${orderId}"]`
            );

            await updateEstimatedTime(
                orderId,
                Number(input.value)
            );
        });
    });
}

async function updateOrderStatus(orderId, status) {
    try {
        await api(`/api/staff/orders/${orderId}/status`, {
            method: "POST",
            body: JSON.stringify({
                status
            })
        });

        showToast(`Order #${orderId} is now ${status}`);
        await loadStaffOrders();
    } catch (error) {
        showToast(error.message);
    }
}

async function updateEstimatedTime(orderId, estimatedTime) {
    if (
        !Number.isInteger(estimatedTime) ||
        estimatedTime < 0 ||
        estimatedTime > 240
    ) {
        showToast("Enter a time between 0 and 240 minutes");
        return;
    }

    try {
        await api(
            `/api/staff/orders/${orderId}/estimated-time`,
            {
                method: "POST",
                body: JSON.stringify({
                    estimated_time: estimatedTime
                })
            }
        );

        showToast("Estimated waiting time updated");
        await loadStaffOrders();
    } catch (error) {
        showToast(error.message);
    }
}

async function loadStaffMenu() {
    try {
        let outletIds = [];

        if (staffState.user.role === "admin") {
            const outletsData = await api("/api/outlets");
            outletIds = outletsData.outlets.map(
                (outlet) => outlet.id
            );
        } else {
            outletIds = [staffState.user.outlet_id];
        }

        const responses = await Promise.all(
            outletIds.map((outletId) =>
                api(`/api/outlets/${outletId}/menu`)
            )
        );

        staffState.menuItems = responses.flatMap(
            (response) => response.items
        );

        renderStaffMenu();
    } catch (error) {
        showToast(error.message);
    }
}

function renderStaffMenu() {
    const container = $("#staff-menu-container");

    if (staffState.menuItems.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div>🍽️</div>
                <h2>No menu items found</h2>
            </div>
        `;

        return;
    }

    container.innerHTML = staffState.menuItems.map((item) => `
        <article class="staff-menu-card">
            <h3>${item.name}</h3>

            <p>${item.description}</p>

            <p>
                ₹${Number(item.price).toFixed(2)}
                · ${item.preparation_time} minutes
            </p>

            <div class="staff-menu-card-footer">
                <span class="${
                    item.is_available
                        ? "available"
                        : "unavailable"
                }">
                    ${
                        item.is_available
                            ? "● Available"
                            : "● Unavailable"
                    }
                </span>

                <button
                    class="
                        availability-button
                        ${
                            item.is_available
                                ? "available-button"
                                : "unavailable-button"
                        }
                    "
                    data-item-id="${item.id}"
                    data-current-state="${item.is_available}"
                >
                    ${
                        item.is_available
                            ? "Mark unavailable"
                            : "Mark available"
                    }
                </button>
            </div>
        </article>
    `).join("");

    document.querySelectorAll(
        ".availability-button"
    ).forEach((button) => {
        button.addEventListener("click", async () => {
            const itemId = Number(button.dataset.itemId);
            const currentState =
                button.dataset.currentState === "1";

            await updateItemAvailability(
                itemId,
                !currentState
            );
        });
    });
}

async function updateItemAvailability(itemId, isAvailable) {
    try {
        await api(
            `/api/staff/menu-items/${itemId}/availability`,
            {
                method: "POST",
                body: JSON.stringify({
                    is_available: isAvailable
                })
            }
        );

        showToast(
            isAvailable
                ? "Item marked available"
                : "Item marked unavailable"
        );

        await loadStaffMenu();
    } catch (error) {
        showToast(error.message);
    }
}

function navigateStaffPage(page) {
    $("#staff-orders-page").classList.add("hidden");
    $("#staff-menu-page").classList.add("hidden");

    document.querySelectorAll(
        ".nav-item[data-staff-page]"
    ).forEach((item) => {
        item.classList.toggle(
            "active",
            item.dataset.staffPage === page
        );
    });

    if (page === "orders") {
        $("#staff-orders-page").classList.remove("hidden");
        $("#staff-page-title").textContent = "Incoming orders";
        loadStaffOrders();
    }

    if (page === "menu") {
        $("#staff-menu-page").classList.remove("hidden");
        $("#staff-page-title").textContent = "Menu availability";
        loadStaffMenu();
    }
}

document.addEventListener("DOMContentLoaded", () => {
    $("#staff-login-form").addEventListener(
        "submit",
        staffLogin
    );

    $("#staff-logout-button").addEventListener(
        "click",
        staffLogout
    );

    $("#collapse-staff-sidebar").addEventListener(
        "click",
        () => {
            $("#staff-sidebar").classList.toggle("collapsed");
        }
    );

    document.querySelectorAll(
        ".nav-item[data-staff-page]"
    ).forEach((item) => {
        item.addEventListener("click", () => {
            navigateStaffPage(item.dataset.staffPage);
        });
    });

    $("#refresh-orders-button").addEventListener(
        "click",
        loadStaffOrders
    );

    $("#refresh-menu-button").addEventListener(
        "click",
        loadStaffMenu
    );

    checkStaffSession();
});