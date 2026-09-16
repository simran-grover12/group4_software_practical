let currentOutletId = null;
let draggedCard = null;

async function api(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Request failed");
    }

    return data;
}

async function checkSession() {
    try {
        const result = await api("/api/session");

        if (!result.authenticated) {
            window.location.href = "/login.html";
            return;
        }

        document.getElementById("userName").textContent = result.user.name;
        loadOutlets();
    } catch (error) {
        window.location.href = "/login.html";
    }
}

async function loadOutlets() {
    const result = await api("/api/outlets");
    const grid = document.getElementById("outletGrid");

    grid.innerHTML = "";

    result.outlets.forEach(outlet => {
        const card = document.createElement("article");
        card.className = "outlet-card";
        card.draggable = true;
        card.dataset.outletId = outlet.id;

        card.innerHTML = `
            <div class="outlet-icon">${outlet.image}</div>
            <h3>${outlet.name}</h3>
            <p>${outlet.description}</p>
            <small>${outlet.cuisine_type}</small>
            <br><br>
            <button>View menu</button>
        `;

        card.querySelector("button").addEventListener("click", () => {
            openMenu(outlet.id, outlet.name);
        });

        card.addEventListener("dragstart", () => {
            draggedCard = card;
            card.classList.add("dragging");
        });

        card.addEventListener("dragend", () => {
            card.classList.remove("dragging");
            draggedCard = null;
        });

        card.addEventListener("dragover", event => {
            event.preventDefault();
        });

        card.addEventListener("drop", event => {
            event.preventDefault();

            if (draggedCard && draggedCard !== card) {
                const cards = [...grid.children];
                const draggedIndex = cards.indexOf(draggedCard);
                const targetIndex = cards.indexOf(card);

                if (draggedIndex < targetIndex) {
                    grid.insertBefore(draggedCard, card.nextSibling);
                } else {
                    grid.insertBefore(draggedCard, card);
                }

                saveOutletOrder();
            }
        });

        grid.appendChild(card);
    });
}

function saveOutletOrder() {
    // Implement a PUT /api/outlet-order endpoint later.
    // For the first version, the order is persisted visually.
    localStorage.setItem(
        "outletOrder",
        JSON.stringify(
            [...document.querySelectorAll(".outlet-card")]
                .map(card => card.dataset.outletId)
        )
    );
}

async function openMenu(outletId, outletName) {
    currentOutletId = outletId;

    document.getElementById("dashboardPage").classList.add("hidden");
    document.getElementById("menuPage").classList.remove("hidden");
    document.getElementById("outletTitle").textContent = outletName;

    await loadMenu();
}

async function loadMenu() {
    const dietaryType = document.getElementById("dietFilter").value;

    const result = await api(
        `/api/menu?outlet_id=${currentOutletId}&dietary_type=${dietaryType}`
    );

    const menuList = document.getElementById("menuList");
    menuList.innerHTML = "";

    const groupedItems = {};

    result.items.forEach(item => {
        const category = item.category_name || "Other";

        if (!groupedItems[category]) {
            groupedItems[category] = [];
        }

        groupedItems[category].push(item);
    });

    Object.entries(groupedItems).forEach(([category, items]) => {
        const categoryElement = document.createElement("div");
        categoryElement.className = "menu-category";

        categoryElement.innerHTML = `<h3>${category}</h3>`;

        items.forEach(item => {
            const itemElement = document.createElement("div");
            itemElement.className = "menu-item";

            const availability = item.is_available
                ? `<span class="available">Available</span>`
                : `<span class="unavailable">Unavailable</span>`;

            itemElement.innerHTML = `
                <div>
                    <h4>${item.name}</h4>
                    <div class="menu-meta">
                        ₹${item.price} · ${item.preparation_time} min · ${availability}
                    </div>
                </div>

                <button
                    ${item.is_available ? "" : "disabled"}
                    data-item-id="${item.id}">
                    Add
                </button>
            `;

            itemElement
                .querySelector("button")
                .addEventListener("click", () => addToCart(item.id));

            categoryElement.appendChild(itemElement);
        });

        menuList.appendChild(categoryElement);
    });
}

async function addToCart(itemId) {
    try {
        await api("/api/cart", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                item_id: itemId,
                quantity: 1
            })
        });

        showCartPopup();
        updateCartCount();
    } catch (error) {
        alert(error.message);
    }
}

function showCartPopup() {
    const popup = document.getElementById("cartPopup");
    popup.classList.remove("hidden");

    setTimeout(() => {
        popup.classList.add("hidden");
    }, 3500);
}

async function updateCartCount() {
    const result = await api("/api/cart");

    const count = result.items.reduce(
        (total, item) => total + item.quantity,
        0
    );

    document.getElementById("cartCount").textContent = count;
}

async function loadCart() {
    const result = await api("/api/cart");
    const cartList = document.getElementById("cartList");

    if (result.items.length === 0) {
        cartList.innerHTML = "<p>Your cart is empty.</p>";
        return;
    }

    cartList.innerHTML = result.items.map(item => `
        <div class="order-card">
            <h3>${item.name}</h3>
            <p>
                ₹${item.price} ×
                <input
                    type="number"
                    min="0"
                    value="${item.quantity}"
                    style="width:60px"
                    onchange="changeQuantity(${item.id}, this.value)"
                >
            </p>
            <strong>₹${item.price * item.quantity}</strong>
        </div>
    `).join("");

    cartList.innerHTML += `
        <h2>Total: ₹${result.total}</h2>
    `;
}

async function changeQuantity(cartItemId, quantity) {
    await api(`/api/cart/${cartItemId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            quantity: Number(quantity)
        })
    });

    await loadCart();
    await updateCartCount();
}

async function placeOrder() {
    try {
        const result = await api("/api/order", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                payment_method: "SIMULATED_ONLINE"
            })
        });

        const payment = confirm(
            `Order #${result.order_id} created for ₹${result.total}. ` +
            "Proceed with simulated payment?"
        );

        if (payment) {
            await api("/api/payment", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    order_id: result.order_id,
                    simulate_success: true
                })
            });

            alert("Payment successful. Your order is being prepared.");
            showPage("orders");
        }
    } catch (error) {
        alert(error.message);
    }
}

async function loadOrders() {
    const result = await api("/api/orders");
    const ordersList = document.getElementById("ordersList");

    if (result.orders.length === 0) {
        ordersList.innerHTML = "<p>No orders yet.</p>";
        return;
    }

    ordersList.innerHTML = result.orders.map(order => `
        <div class="order-card">
            <h3>Order #${order.id}</h3>
            <p>${order.outlet_name}</p>
            <p>Total: ₹${order.total}</p>
            <p>Status: <strong>${order.status}</strong></p>
            <p>Payment: ${order.payment_status}</p>
            <p>Estimated time: ${order.estimated_time} minutes</p>
        </div>
    `).join("");
}

async function loadNotifications() {
    const result = await api("/api/notifications");
    const list = document.getElementById("notificationsList");

    list.innerHTML = result.notifications.map(notification => `
        <div class="notification-card">
            🔔 ${notification.message}
            <br>
            <small>${notification.created_at}</small>
        </div>
    `).join("");
}

function showPage(page) {
    const pages = {
        dashboard: "dashboardPage",
        cart: "cartPage",
        orders: "ordersPage",
        notifications: "notificationsPage"
    };

    Object.values(pages).forEach(id => {
        document.getElementById(id).classList.add("hidden");
    });

    if (pages[page]) {
        document.getElementById(pages[page]).classList.remove("hidden");
    }

    if (page === "cart") loadCart();
    if (page === "orders") loadOrders();
    if (page === "notifications") loadNotifications();

    document.getElementById("pageTitle").textContent =
        page.charAt(0).toUpperCase() + page.slice(1);
}

document
    .getElementById("collapseSidebar")
    .addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("collapsed");
    });

document
    .getElementById("backToDashboard")
    .addEventListener("click", () => {
        showPage("dashboard");
    });

document
    .getElementById("dietFilter")
    .addEventListener("change", loadMenu);

document
    .getElementById("placeOrderButton")
    .addEventListener("click", placeOrder);

document
    .getElementById("logoutButton")
    .addEventListener("click", async () => {
        await api("/api/logout", { method: "POST" });
        window.location.href = "/login.html";
    });

document.querySelectorAll(".nav-item[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        showPage(button.dataset.page);
    });
});

checkSession();

setInterval(() => {
    updateCartCount();
}, 10000);

setInterval(() => {
    if (!document.getElementById("ordersPage").classList.contains("hidden")) {
        loadOrders();
    }
}, 10000);