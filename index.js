window.addEventListener("DOMContentLoaded", () => {
  init();
});

/**
 * Initialize any javascript
 */
const DARK_CLASS = "dark-theme";

const ADMINS = [
  {
    name: "Jokler",
    bio: "wait what do you need that for?",
    avatar: "https://decider.com/wp-content/uploads/2018/03/tommy-wiseau-joker.jpg",
  },
  {
    name: "kilmanio",
    bio: "i buy 2 guitar pedals / week",
    avatar: "https://cloud.funda.nl/valentina_media/156/514/097_180x120.jpg",
  },
  {
    name: "zealsprince",
    bio: "i press buttons",
    avatar: "https://avatars.githubusercontent.com/u/1859270?v=4",
  },
];

const MODERATORS = [
  { name: "dolanske", image: "" },
  { name: "Rapid", image: "https://i.imgur.com/nlD4nxx.png" },
  { name: "Chantaro", image: "https://i.imgur.com/1Ee0S4C.jpeg" },
  { name: "Silomare", image: "https://i.imgur.com/a7aHbwg.png" },
  { name: "Yuki", image: "" },
  { name: "Jarl", image: "" },
];

function init() {
  const isDark = localStorage.getItem(DARK_CLASS);

  if (isDark == "true") {
    $("html").addClass(DARK_CLASS);
  }

  $("img").on("error", ({ self }) => {
    $(self).addClass("image-error");
  });

  $("#dark-mode-toggle").click(() => {
    $("html").toggleClass(DARK_CLASS);

    localStorage.setItem(DARK_CLASS, $("html").attr("class").includes(DARK_CLASS) ? true : false);
  });

  // $("#copy").text(`Made in ${new Date().getFullYear()} by <a href="">Mavulp</a>`);
  $("#copy").addChild(`<p>
      Made in ${new Date().getFullYear()} by 
      <a href="https://github.com/Mavulp" target="_blank">Mavulp</a>
    </p>`);

  // Generate admins & moderators
  $("#admins").addChild(({ render }) => {
    return ADMINS.map((admin) => {
      return render("div", { class: "admin" }, [
        render("img", { src: admin.avatar }),
        render("strong", admin.name),
        render("p", admin.bio),
      ]);
    });
  });

  $("#moderators").addChild(({ render }) => {
    return MODERATORS.map((user) => {
      return render("div", { class: "moderator" }, [
        render("img", {
          src: user.avatar,
          alt: " ",
          onerror: (e) => e.target.classList.add("image-error"),
        }),
        render("strong", user.name),
      ]);
    });
  });
}
